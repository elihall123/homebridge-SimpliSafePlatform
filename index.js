//homebridge-platform-simplisafe
const { API, CameraSource } = require('./client/api');

var Accessory, Service, Characteristic, UUIDGen, User, hap, StreamController;
var ss; //SimpliSafe Client

module.exports = homebridge => {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  User = homebridge.user;
  hap = homebridge.hap;
  StreamController = homebridge.hap.StreamController;
    
  homebridge.registerPlatform("homebridge-simplisafeplatform", "homebridge-simplisafeplatform", SimpliSafe, true);
}


class SimpliSafe {
  
  configureAccessory(accessory) {
    accessory.reachable = false;
    this.accessories.push(accessory);
  };// End Of Function configureAccessory

  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.ssAccessories = [];
    this.accessories = [];
    this.systemTemp = false;
    
    ss = new API(config.SerialNumber, config.username, log);
    this.supportedDevices = [
      ss.ssDeviceIds.baseStation,
      ss.ssDeviceIds.motionSensor,
      ss.ssDeviceIds.entrySensor,
      ss.ssDeviceIds.glassbreakSensor,
      ss.ssDeviceIds.coDetector,
      ss.ssDeviceIds.smokeDetector,
      ss.ssDeviceIds.waterSensor,
      ss.ssDeviceIds.freezeSensor,
      ss.ssDeviceIds.camera
    ];

    this.refresh_timer = this.config.refresh_timer * 1000 || 15000;

    this.initial = ss.login_via_credentials(config.password)
    .then(()=>{
      return this.loadSS();
    });

    if (api) {
      this.api = api;
      this.api.on('didFinishLaunching', ()=> { 
        this.initial.then(()=>{
          this.updateSS();
          this.SocketEvents = ss.get_SokectEvents(data => {
            if (data==='DISCONNECT') {
              this.log("Event Socket Disconnected. Trying to reconnect...")
              ss.login_via_credentials(config.password);
              this.SocketEvents;
            }
            if (!data.eventCid) return;
            if (data.sid != ss.subId) return;
            if (!this.supportedDevices.includes(data.type)) return;
            
            let accessory, countDown, displayName ;

            if (data.sensorType == ss.ssDeviceIds.baseStation) {
              accessory = this.accessories.find(pAccessory => pAccessory.UUID == UUIDGen.generate(ss.ssDeviceIds[data.sensorType] + ' ' + data.account.toLowerCase()));
            } else if (data.sensorType == ss.ssDeviceIds.camera) {
              accessory = this.accessories.find(pAccessory => pAccessory.UUID == UUIDGen.generate(ss.ssDeviceIds[data.sensorType] + ' ' + data.internal.maincamera.toLowerCase()));
            } else {
              accessory = this.accessories.find(pAccessory => pAccessory.UUID == UUIDGen.generate(ss.ssDeviceIds[data.sensorType] + ' ' + data.sensorSerial.toLowerCase()));
            };
            
            let service = accessory.getService(this.serviceConvertSStoHK(data.sensorType));

            switch (data.eventCid.toString()) {
              case ss.ssEventContactIds.systemArmed:
              case ss.ssEventContactIds.alarmCanceled:
                this.log(data);
                break;

              case ss.ssEventContactIds.alarmSmokeDetectorTriggered:
              case ss.ssEventContactIds.alarmPanicButtonTriggered:
              case ss.ssEventContactIds.alarmMotionOrGlassbreakSensorTriggered:
              case ss.ssEventContactIds.alarmEntrySensorTriggered:
              case ss.ssEventContactIds.alarmOther:
              case ss.ssEventContactIds.alarmWaterSensorTriggered:
              case ss.ssEventContactIds.alarmHeatSensorTriggered:
              case ss.ssEventContactIds.alarmFreezeSensorTriggered:
              case ss.ssEventContactIds.alarmCoSensorTriggered:
                this.log("System Alarm Triggered form");
                service.setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
                break;

              case ss.ssEventContactIds.alarmSmokeDetectorStopped: 
              case ss.ssEventContactIds.alarmWaterSensorStopped:
              case ss.ssEventContactIds.alarmFreezeSensorStopped:
              case ss.ssEventContactIds.alarmCoSensorStopped:
              case ss.ssEventContactIds.alarmHeatSensorStopped:
                this.log("System Alarm Silenced");
                service.setCharacteristic(Characteristic.SecuritySystemCurrentState, accessory.getService(Service.SecuritySystem).getCharacteristic(Characteristic.SecuritySystemTargetState));
                break;

              case ss.ssEventContactIds.systemHome2:
              case ss.ssEventContactIds.systemArmedHome:
                this.log("System Set for Home");
                if (countDown) clearInterval(countDown);
                service.setCharacteristic(Characteristic.Name, displayName);
                service.setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.STAY_ARM);  
                break;

              case ss.ssEventContactIds.systemArmedAway:
              case ss.ssEventContactIds.systemAwayRemote:
              case ss.ssEventContactIds.systemAway2:
              case ss.ssEventContactIds.systemAway2Remote:
                this.log("System Set for Away");
                if (countDown) clearInterval(countDown);
                service.setCharacteristic(Characteristic.Name, displayName);
                service.setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.AWAY_ARM);  
                break;

              case ss.ssEventContactIds.alarmCanceled:
              case ss.ssEventContactIds.systemDisarmed:
              case ss.ssEventContactIds.systemOff:
                this.log("System Disarm");
                if (countDown) clearInterval(countDown);
                service.setCharacteristic(Characteristic.Name, displayName);
                service.setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.DISARMED);  
                break;

              case ss.ssEventContactIds.sensorError:
                this.log(`${accessory.displayName} sensor error.`);
                accessory.reachable = false;
                service.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT);
                break;

              case ss.ssEventContactIds.sensorRestored:
                this.log(`${accessory.displayName} sensor restored.`);
                accessory.reachable = true;
                service.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT);
                break;
                
              case ss.ssEventContactIds.entryDelay:
                service.getCharacteristic(this.characteristicConvertSStoHK(sensor.type)).updateValue(Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
                break;

              case ss.ssEventContactIds.alertSecret:
                service.getCharacteristic(this.characteristicConvertSStoHK(sensor.type)).setValue(true);
                break;
  
              case ss.ssEventContactIds.warningSensorOpen:
                this.log(data);
                this.log(`${accessory.displayName} sensor opened.`);
                // Need to figure out in how to send a message to the HK.
                service.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT);
                break;

              case ss.ssEventContactIds.batteryLow:
                this.log(`${accessory.displayName} sensor battery is low.`);
                service.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
                break;

              case ss.ssEventContactIds.batteryRestored:
                this.log(`${accessory.displayName} sensor battery has been restored.`);
                service.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
                break;

              case ss.ssEventContactIds.wiFiOutage:
                accessory.reachable = false;
                service.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT);
                break;

              case ss.ssEventContactIds.wiFiRestored:
                accessory.reachable = true;
                service.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT);
                break;

              case ss.ssEventContactIds.sensorAdded:
                this.ssAccessories.push({uuid: UUIDGen.generate(ss.ssDeviceIds[data.sensorType] + ' ' + data.sensorSerial.toLowerCase()), 'type': data.sensorType, 'serial': data.sensorSerial, 'name': data.sensorName});
                this.updateSS();
                break;

              case ss.ssEventContactIds.sensorNamed:
                accessory.displayName = data.sensorName;
                break;

              case ss.ssEventContactIds.systemPowerOutage:
              case ss.ssEventContactIdssystemInterferenceDetected:
                this.log(`${accessory.displayName} fault.`);
                service.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT);
                break;
                
              case ss.ssEventContactIds.systemPowerRestored:
              case ss.ssEventContactIds.systemInterferenceResolved:
                this.log(`${accessory.displayName} restored.`);
                service.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT);
                break;

              case ss.ssEventContactIds.systemHomeCount:
              case ss.ssEventContactIds.systemAwayCount:
              case ss.ssEventContactIds.systemAwayCountRemote:
                let timer;
                displayName = service.getCharacteristic(Characteristic.Name);
                this.log(`${accessory.displayName} ${data.exitDelay} second(s) count down started.`);
                
                countDown = setInterval(()=>{
                    service.setCharacteristic(Characteristic.Name, 'Setting Alarm waiting ' + timer + ' (s)');
                    timer++;
                }, 1000);
                break;

              case ss.ssEventContactIds.cameraRecording:
                service.getCharacteristic(this.characteristicConvertSStoHK(sensor.type)).updateValue(true);
                break;
  
              case ss.ssEventContactIds.doorbellRang:
                this.log(data);
                break;
                
              default:
                this.log(data);
                break;
            };
                        
            if (this.systemTemp == true) {
                ss.get_System()
                .then((system)=>{
                  this.log('Refreshing System Temperature')
                  let accessory = this.accessories.find(pAccessory => pAccessory.UUID == UUIDGen.generate(ss.ssDeviceIds[ss.ssDeviceIds.baseStation] + ' ' + system.serial.toLowerCase()));
                  accessory.getService(Service.TemperatureSensor).getCharacteristic(Characteristic.CurrentTemperature).updateValue((system.temperature-32) * 5/9);  
                })
            };
          
            ss.get_Sensors(false)
            .then((sensors)=>{
              if (!sensors) return;
              sensors.forEach((sensor)=> {
                if (this.supportedDevices.includes(sensor.type)) {
                  let accessory = this.accessories.find(pAccessory => pAccessory.UUID == UUIDGen.generate(ss.ssDeviceIds[sensor.type] + ' ' + sensor.serial.toLowerCase()));
                  let service = accessory.getService(this.serviceConvertSStoHK(sensor.type))
                  if (sensor.status.triggered != undefined) service.getCharacteristic(this.characteristicConvertSStoHK(sensor.type)).updateValue(sensor.status.triggered);
                  if (sensor.status.temperature != undefined) service.getCharacteristic(Characteristic.CurrentTemperature).updateValue((sensor.status.temperature-32) * 5/9);
                };
              });
            });

          });
        });
      });
    };
  };//End Of Function SimpliSafe 
  
  AccCatConvertSStoHK(type){
    switch (type) {
      case ss.ssDeviceIds.baseStation:
        return (hap.Accessory.Categories.SECURITY_SYSTEM);
      case ss.ssDeviceIds.freezeSensor:
        return (hap.Accessory.Categories.THERMOSTAT);
      case ss.ssDeviceIds.Camera:
        return (hap.Accessory.Categories.IP_CAMERA);
      default:
        return (hap.Accessory.Categories.SENSOR);
    };
  };//End Of Function AccCatConvertSStoHK

  serviceConvertSStoHK(type){
    switch (type) {
      case ss.ssDeviceIds.coDetector:
        return (Service.CarbonMonoxideSensor);
      case ss.ssDeviceIds.entrySensor:
        return (Service.ContactSensor);
      case ss.ssDeviceIds.waterSensor:
        return (Service.LeakSensor);
      case ss.ssDeviceIds.glassbreakSensor:
      case ss.ssDeviceIds.motionSensor:
      case ss.ssDeviceIds.camera:
          return (Service.MotionSensor);
      case ss.ssDeviceIds.baseStation:
        return (Service.SecuritySystem);
      case ss.ssDeviceIds.smokeDetector:
        return (Service.SmokeSensor);
      case ss.ssDeviceIds.freezeSensor:
        return (Service.TemperatureSensor);
    };
  };//End Of Function serviceConvertSStoHK
  
  characteristicConvertSStoHK(type){
    switch (type) {
      case ss.ssDeviceIds.coDetector:
        return (Characteristic.CarbonMonoxideDetected);
      case ss.ssDeviceIds.entrySensor:
        return (Characteristic.ContactSensorState);
      case ss.ssDeviceIds.waterSensor:
        return (Characteristic.LeakDetected);
      case ss.ssDeviceIds.glassbreakSensor:
      case ss.ssDeviceIds.motionSensor:
      case ss.ssDeviceIds.camera:
        return (Characteristic.MotionDetected);
      case ss.ssDeviceIds.baseStation:
        return (Characteristic.SecuritySystemCurrentState);
      case ss.ssDeviceIds.smokeDetector:
        return (Characteristic.SmokeDetected);
      case ss.ssDeviceIds.freezeSensor:
        return (Characteristic.CurrentTemperature);
    };
  };//End Of Function serviceConvertSStoHK

  async loadSS(){
    let system = await ss.get_System();
    this.ssAccessories.push({uuid: UUIDGen.generate(ss.ssDeviceIds[ss.ssDeviceIds.baseStation] + ' ' + system.serial.toLowerCase()), 'type': ss.ssDeviceIds.baseStation, 'status': { triggered: system.isAlarming ? 'ALARM' : system.alarmState, temp: system.temperature }, 'serial': system.serial, 'name': 'SimpliSafe Alarm System'});

    for (let sensor of await ss.get_Sensors()){
      if (this.supportedDevices.includes(sensor.type)) {
        sensor = {uuid: UUIDGen.generate(ss.ssDeviceIds[sensor.type] + ' ' + sensor.serial.toLowerCase()), ...sensor};
        this.ssAccessories.push(sensor);
      };
    };

    for (let camera of system.cameras){
      this.ssAccessories.push({uuid: UUIDGen.generate(ss.ssDeviceIds[ss.ssDeviceIds.camera] + ' ' + camera.uuid.toLowerCase()), 'type': ss.ssDeviceIds.camera, 'serial': camera.uuid, 'name': camera.cameraSettings.cameraName || 'Camera', flags: {offline: camera.status=='online'?false:true}, fps: camera.cameraSettings.admin.fps});
    }

  };//End Of Function loadSS

  async updateSS() {
    for (let ssAccessory of this.ssAccessories){
      
      let device = this.accessories.find(accessory => accessory.UUID == ssAccessory.uuid);

      if (!device) {
        device  = new 
        (ssAccessory.name, ssAccessory.uuid, this.AccCatConvertSStoHK(ssAccessory.type));
        device.getService(Service.AccessoryInformation)
          .setCharacteristic(Characteristic.SerialNumber, ssAccessory.serial)
          .setCharacteristic(Characteristic.Manufacturer, 'SimpliSafe')
          .setCharacteristic(Characteristic.Model, Object.keys(ss.ssDeviceIds).find(key => ss.ssDeviceIds[key] === ssAccessory.type)); 
          this.log('publishing a new this accessory', device.displayName);
          this.accessories.push(device);
          await this.api.registerPlatformAccessories("homebridge-simplisafeplatform", "homebridge-simplisafeplatform", [device]);  
      };      


      if (ssAccessory.type === ss.ssDeviceIds.baseStation) {
        if (!device.getService(Service.SecuritySystem)) device.addService(Service.SecuritySystem);
        if (ssAccessory.status.temp!=null) {
          this.systemTemp = true;
          if (!device.getService(Service.TemperatureSensor)) device.addService(Service.TemperatureSensor);
          device.getService(Service.TemperatureSensor).setCharacteristic(Characteristic.CurrentTemperature, '15');
        } else {
          device.services.filter(service => service.UUID === Service.TemperatureSensor.UUID).map(service => {device.removeService(service);});
        };
        let ssService = device.getService(Service.SecuritySystem);
        ssService.getCharacteristic(Characteristic.SecuritySystemCurrentState)
          .setProps({validValues: [Characteristic.SecuritySystemCurrentState.STAY_ARM, Characteristic.SecuritySystemCurrentState.AWAY_ARM, Characteristic.SecuritySystemCurrentState.DISARMED, Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED]})

        switch(ssAccessory.status.triggered.toLowerCase()) {
          case "off":
              device.getService(Service.SecuritySystem).setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.DISARM);
              device.getService(Service.SecuritySystem).setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.DISARMED);
              break;
          case "home":
              device.getService(Service.SecuritySystem).setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.STAY_ARM);
              device.getService(Service.SecuritySystem).setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.STAY_ARM);
              break;
          case "away":
              device.getService(Service.SecuritySystem).setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.AWAY_ARM);
              device.getService(Service.SecuritySystem).setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.AWAY_ARM);
              break;
          case "alarm":
              device.getService(Service.SecuritySystem).setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
              break;
        };


        ssService.getCharacteristic(Characteristic.SecuritySystemTargetState)
          .setProps({validValues: [Characteristic.SecuritySystemTargetState.STAY_ARM, Characteristic.SecuritySystemTargetState.AWAY_ARM, Characteristic.SecuritySystemTargetState.DISARM]});

        ssService.getCharacteristic(Characteristic.SecuritySystemTargetState)
          .on('set', async (state, callback)=>{
            if (device.reachable) {
              let err409;
              switch (state) {
                case Characteristic.SecuritySystemTargetState.STAY_ARM:
                  this.log('Arming System for Home.');
                  err409 = setInterval(async ()=>{
                    let resp = await ss.set_Alarm_State("home");
                    if (resp.statusCode!=409) clearInterval(err409);
                  }, 5000);
                  break;
                case Characteristic.SecuritySystemTargetState.AWAY_ARM:
                  this.log('Arming System for Away.');
                  err409 = setInterval(async ()=>{
                    let resp = await ss.set_Alarm_State("away");
                    if (resp.statusCode!=409) clearInterval(err409);
                  }, 5000);
                  break;
                case Characteristic.SecuritySystemTargetState.DISARM:
                  this.log('Disarming System.');
                  err409 = setInterval(async ()=>{
                    let resp = await ss.set_Alarm_State("off");
                    if (resp.statusCode!=409) clearInterval(err409);
                  }, 5000);

                  break;
              };                
              callback(null, state);
            } else {
              callback("no_response");
            };
          });
        
      } else  if (ssAccessory.type === ss.ssDeviceIds.camera){
        if (!device.getService(Service.CameraControl)) device.addService(Service.CameraControl);
        if (!device.getService(Service.Microphone)) device.addService(Service.Microphone);
        if (!device.getService(Service.MotionSensor)) device.addService(Service.MotionSensor);
        device.services.filter(service => service.UUID === Service.CameraRTPStreamManagement.UUID).map(service => {
          device.removeService(service);
        });
    
        device.configureCameraSource(new CameraSource(ssAccessory, UUIDGen, StreamController, this.log));
            
      } else {
        if (!device.getService(this.serviceConvertSStoHK(ssAccessory.type))) device.addService(this.serviceConvertSStoHK(ssAccessory.type));
        device.getService(this.serviceConvertSStoHK(ssAccessory.type)).setCharacteristic(Characteristic.StatusLowBattery, ssAccessory.flags.lowBattery);

      };

      device.reachable = true;
      device.on('identify', function(paired, callback) {
        console.log(`${device.displayName} identified and added.`);
        callback(); // success
      });

    };
  };// End Of Function updateSS 
    
}; // End Of Class SimpliSafe

