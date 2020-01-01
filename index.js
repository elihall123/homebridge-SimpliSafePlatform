//homebridge-platform-simplisafe
const { API, CameraSource } = require('./client/api');

var Accessory, Service, Characteristic, UUIDGen, hap, StreamController;
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
    this.hkAccessories.push(accessory);
  };// End Of Function configureAccessory

  constructor(log, config, api) {
    this.log = log;
    this.hkAccessories = [];
    ss = new API(config, log, UUIDGen);

    this.supportedHKDevices = [
      ss.DeviceIds.baseStation,
      ss.DeviceIds.motionSensor,
      ss.DeviceIds.entrySensor,
      ss.DeviceIds.glassbreakSensor,
      ss.DeviceIds.coDetector,
      ss.DeviceIds.smokeDetector,
      ss.DeviceIds.waterSensor,
      ss.DeviceIds.freezeSensor,
      ss.DeviceIds.camera,
      ss.DeviceIds.doorLock
    ];

    try{
      this.initial = ss.login_via_credentials();
    } catch (err) {
      this.log("ssAPI Login Error:", err);
    }

    if (api) {
      this.api = api;
      this.api.on('didFinishLaunching', ()=> { 
        this.initial.then(()=>{
          this.updateHKAccessories();
          this.HKEventsHandler();          
        });
      });
    };
  };//End Of Function SimpliSafe 

  HKEventsHandler(){
    ss.get_SokectEvents((type, data) => {
      
      switch (type) {
        case 'systemEvent':
          this.HKSystemEvents(data);
          break;

        case 'hiddenEvent':
          this.log(data); //Will need to be set up for Motion Sensor;
          break;

        case 'cameraEvent':
          this.HKCameraEvents(data);
          break;
      };
    });

  };//End Of Function HKEventsHandler

  HKCameraEvents(data) {
    switch(data.eventType) {
      case 'cameraStatus':
          let hkAccessory = this.hkAccessories.find(accessory => accessory.UUID == data.uuid);
          if (data.status == 'offline') hkAccessory.setCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE); else hkAccessory.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE);
        default:
          this.log(data);
    };
 
  };//End of cameraEvents Function

  HKSystemEvents(data) {
    if (!this.supportedHKDevices.includes(data.sensorType)) return;

    let accessory;

    if (data.messageBody=='') this.log(data.info); else this.log(data.messageBody);

    if (data.sensorType == ss.DeviceIds.baseStation) {
      accessory = this.hkAccessories.find(pAccessory => pAccessory.UUID == UUIDGen.generate(ss.DeviceIds[data.sensorType] + ' ' + data.account.toLowerCase()));
    } else if (data.sensorType == ss.DeviceIds.camera) {
      accessory = this.hkAccessories.find(pAccessory => pAccessory.UUID == UUIDGen.generate(ss.DeviceIds[data.sensorType] + ' ' + data.internal.maincamera.toLowerCase()));
    } else {
      accessory = this.hkAccessories.find(pAccessory => pAccessory.UUID == UUIDGen.generate(ss.DeviceIds[data.sensorType] + ' ' + data.sensorSerial.toLowerCase()));
    };

    //this.log(this.serviceConvertSStoHK(data.sensorType).UUID);
    
    let service = accessory.getService(this.serviceConvertSStoHK(data.sensorType));

    switch (data.eventCid.toString()) {
      case ss.EventContactIds.systemArmed:
        this.log('Armed??')
        break;

      case ss.EventContactIds.alarmOther:
      case ss.EventContactIds.alarmPanicButtonTriggered:
      case ss.EventContactIds.alarmSmokeDetectorTriggered:
      case ss.EventContactIds.alarmEntrySensorTriggered:
      case ss.EventContactIds.alarmWaterSensorTriggered:
      case ss.EventContactIds.alarmCoSensorTriggered:
      case ss.EventContactIds.alarmMotionOrGlassbreakSensorTriggered:
        service.setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
        break;

      case ss.EventContactIds.alarmSmokeDetectorStopped: 
      case ss.EventContactIds.alarmCoSensorStopped:
      case ss.EventContactIds.alarmCanceled:
      case ss.EventContactIds.alarmHeatSensorTriggered:
      case ss.EventContactIds.alarmFreezeSensorTriggered:
      case ss.EventContactIds.alarmWaterSensorStopped:
      case ss.EventContactIds.alarmFreezeSensorStopped:
      case ss.EventContactIds.alarmHeatSensorStopped:
        service.setCharacteristic(Characteristic.SecuritySystemCurrentState, accessory.getService(Service.SecuritySystem).getCharacteristic(Characteristic.SecuritySystemTargetState));
        if (service.getCharacteristic(Characteristic.SecuritySystemCurrentState).value != service.getCharacteristic(Characteristic.SecuritySystemTargetState).value) service.setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.STAY_ARM); 
        break;

      case ss.EventContactIds.systemHome2:
      case ss.EventContactIds.systemArmedHome:
        if (service.getCharacteristic(Characteristic.SecuritySystemCurrentState).value != Characteristic.SecuritySystemCurrentState.STAY_ARM) service.setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.STAY_ARM);
        if (service.getCharacteristic(Characteristic.SecuritySystemCurrentState).value != service.getCharacteristic(Characteristic.SecuritySystemTargetState).value) service.setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.STAY_ARM); 
        break;

      case ss.EventContactIds.systemArmedAway:
      case ss.EventContactIds.systemAwayRemote:
      case ss.EventContactIds.systemAway2:
      case ss.EventContactIds.systemAway2Remote:
        if (service.getCharacteristic(Characteristic.SecuritySystemCurrentState).value != Characteristic.SecuritySystemCurrentState.AWAY_ARM) service.setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.AWAY_ARM); 
        if (service.getCharacteristic(Characteristic.SecuritySystemCurrentState).value != service.getCharacteristic(Characteristic.SecuritySystemTargetState).value) service.setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.AWAY_ARM); 
        break;

      case ss.EventContactIds.systemDisarmed:
      case ss.EventContactIds.systemOff:
        if (service.getCharacteristic(Characteristic.SecuritySystemCurrentState).value != Characteristic.SecuritySystemCurrentState.DISARMED) service.setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.DISARMED); 
        if (service.getCharacteristic(Characteristic.SecuritySystemCurrentState).value != service.getCharacteristic(Characteristic.SecuritySystemTargetState).value) service.setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.DISARMED); 
        break;

      case ss.EventContactIds.sensorError:
        service.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT);
        break;

      case ss.EventContactIds.sensorRestored:
        service.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT);
        break;
        
      case ss.EventContactIds.entryDelay:
        service.setCharacteristic(this.characteristicConvertSStoHK(data.sensorType), Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
        break;

      case ss.EventContactIds.alertSecret:
        service.setCharacteristic(this.characteristicConvertSStoHK(data.sensorType), 1);
        break;

      case ss.EventContactIds.warningSensorOpen:
        this.log(data);
        // Need to figure out in how to send a message to the HK.
        // Need to stop SS from arming the home.
        service.setCharacteristic(this.characteristicConvertSStoHK(data.sensorType), 1);
        break;

      case ss.EventContactIds.batteryLow:
        service.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
        break;

      case ss.EventContactIds.batteryRestored:
        service.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
        break;

      case ss.EventContactIds.sensorAdded:
        this.ssAccessories.push({uuid: UUIDGen.generate(ss.DeviceIds[data.sensorType] + ' ' + data.sensorSerial.toLowerCase()), 'type': data.sensorType, 'serial': data.sensorSerial, 'name': data.sensorName});
        break;

      case ss.EventContactIds.sensorNamed:
        accessory.displayName = data.sensorName;
        break;

      case ss.EventContactIds.systemPowerOutage:
      case ss.ssEventContactIdssystemInterferenceDetected:
      case ss.EventContactIds.wiFiOutage: //do I care if this is running on a cell??
      service.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT);
        break;
        
      case ss.EventContactIds.wiFiRestored:
      case ss.EventContactIds.systemPowerRestored:
      case ss.EventContactIds.systemInterferenceResolved:
        service.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT);
        break;

      case ss.EventContactIds.systemHomeCount:
      case ss.EventContactIds.systemAwayCount:
      case ss.EventContactIds.systemAwayCountRemote:
        // Got to figure out count down....
        break;

      case ss.EventContactIds.cameraRecording:
        service.setCharacteristic(this.Characteristic.MotionDetected, true);
        setTimeout(() => {
          service.setCharacteristic(this.Characteristic.MotionDetected, false);
        }, 3000);
        break;

      case ss.EventContactIds.doorbellRang:
        service.getService(this.Service.Doorbell).setCharacteristic(Characteristic.ProgrammableSwitchEvent, Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
        break;

      case ss.EventContactIds.entryunlocked:
        if (service.getCharacteristic(Characteristic.LockCurrentState).value != Characteristic.LockCurrentState.UNSECURED) service.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.UNSECURED); 
        if (service.getCharacteristic(Characteristic.LockTargetState).value != Characteristic.LockTargetState.UNSECURED) service.setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.UNSECURED); 
        break;

      case ss.EventContactIds.entrylocked:
        if (service.getCharacteristic(Characteristic.LockCurrentState).value != Characteristic.LockCurrentState.SECURED) service.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.SECURED); 
        if (service.getCharacteristic(Characteristic.LockTargetState).value != Characteristic.LockTargetState.SECURED) service.setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED); 
        break;

      case ss.EventContactIds.entrySensorSynced:
        service.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT);
        break;

      case ss.EventContactIds.entrySensorUnsynced:
        service.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT);
        break;

      case ss.EventContactIds.testSignalReceivedUser:
      case ss.EventContactIds.testSignalReceivedSensor:
      case ss.EventContactIds.testSignalReceivedAuto:
        break;

      case ss.EventContactIds.unknown:
        this.log(data);
        break;
    };

  };//End of HKSystemEvents Function

  AccCatConvertSStoHK(type){
    switch (type) {
      case ss.DeviceIds.baseStation:
        return (hap.Accessory.Categories.SECURITY_SYSTEM);
      case ss.DeviceIds.freezeSensor:
        return (hap.Accessory.Categories.THERMOSTAT);
      case ss.DeviceIds.Camera:
        return (hap.Accessory.Categories.IP_CAMERA);
      default:
        return (hap.Accessory.Categories.SENSOR);
    };
  };//End Of Function AccCatConvertSStoHK

  serviceConvertSStoHK(type){
    switch (type) {
      case ss.DeviceIds.coDetector:
        return (Service.CarbonMonoxideSensor);
      case ss.DeviceIds.entrySensor:
        return (Service.ContactSensor);
      case ss.DeviceIds.waterSensor:
        return (Service.LeakSensor);
      case ss.DeviceIds.glassbreakSensor:
      case ss.DeviceIds.motionSensor:
      case ss.DeviceIds.camera:
          return (Service.MotionSensor);
      case ss.DeviceIds.baseStation:
        return (Service.SecuritySystem);
      case ss.DeviceIds.smokeDetector:
        return (Service.SmokeSensor);
      case ss.DeviceIds.freezeSensor:
        return (Service.TemperatureSensor);
      case ss.DeviceIds.doorLock:
        return (Service.LockMechanism);
          };
  };//End Of Function serviceConvertSStoHK
  
  characteristicConvertSStoHK(type){
    switch (type) {
      case ss.DeviceIds.coDetector:
        return (Characteristic.CarbonMonoxideDetected);
      case ss.DeviceIds.entrySensor:
        return (Characteristic.ContactSensorState);
      case ss.DeviceIds.waterSensor:
        return (Characteristic.LeakDetected);
      case ss.DeviceIds.glassbreakSensor:
      case ss.DeviceIds.motionSensor:
      case ss.DeviceIds.camera:
        return (Characteristic.MotionDetected);
      case ss.DeviceIds.baseStation:
        return (Characteristic.SecuritySystemCurrentState);
      case ss.DeviceIds.smokeDetector:
        return (Characteristic.SmokeDetected);
      case ss.DeviceIds.freezeSensor:
        return (Characteristic.CurrentTemperature);
      case ss.DeviceIds.doorLock:
        return (Characteristic.LockCurrentState);
    };
  };//End Of Function serviceConvertSStoHK

  async updateHKAccessories() {
    let hkService, hkCharacteristic;
    for (let ssAccessory of ss.Accessories) {   
      if (!this.supportedHKDevices.includes(ssAccessory.type)) continue;
      let hkAccessory = this.hkAccessories.find(accessory => accessory.UUID == ssAccessory.uuid);

      if (!hkAccessory) {
        hkAccessory = new Accessory(ssAccessory.name, ssAccessory.uuid, this.AccCatConvertSStoHK(ssAccessory.type));
        hkAccessory.getService(Service.AccessoryInformation)
          .setCharacteristic(Characteristic.SerialNumber, ssAccessory.serial)
          .setCharacteristic(Characteristic.Manufacturer, 'SimpliSafe')
          .setCharacteristic(Characteristic.Model, ssAccessory.model);

          this.log(`New ${hkAccessory.displayName} accessory found`);
          this.hkAccessories.push(hkAccessory);
          await this.api.registerPlatformAccessories("homebridge-simplisafeplatform", "homebridge-simplisafeplatform", [hkAccessory]);  
      };


      switch (ssAccessory.type) {
        case ss.DeviceIds.baseStation: //Base Stations
        if (!hkAccessory.getService(Service.SecuritySystem)) hkAccessory.addService(Service.SecuritySystem);
        if (ssAccessory.status.temp!=null) {
          if (!hkAccessory.getService(Service.TemperatureSensor)) hkAccessory.addService(Service.TemperatureSensor);
          hkAccessory.getService(Service.TemperatureSensor).setCharacteristic(Characteristic.CurrentTemperature, (ssAccessory.status.temp - 32) * 5/9);
        } else {
          if (hkAccessory.getService(Service.TemperatureSensor)) hkAccessory.services.filter(service => service.UUID === Service.TemperatureSensor.UUID).map(service => { hkAccessory.removeService(service) });
        };

        hkService = hkAccessory.getService(Service.SecuritySystem);

        hkService.getCharacteristic(Characteristic.SecuritySystemCurrentState)
          .setProps({validValues: [Characteristic.SecuritySystemCurrentState.STAY_ARM, Characteristic.SecuritySystemCurrentState.AWAY_ARM, Characteristic.SecuritySystemCurrentState.DISARMED, Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED]});
        hkService.getCharacteristic(Characteristic.SecuritySystemTargetState)
          .setProps({validValues: [Characteristic.SecuritySystemTargetState.STAY_ARM, Characteristic.SecuritySystemTargetState.AWAY_ARM, Characteristic.SecuritySystemTargetState.DISARM]});
        
        switch(ssAccessory.status.triggered.toLowerCase()) {
          case "off":
            hkService.setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.DISARMED);
            hkService.setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.DISARMED);
            break;
          case "home":
            hkService.setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.STAY_ARM);
            hkService.setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.STAY_ARM);
            break;
          case "away":
            hkService.setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.AWAY_ARM);
            hkService.setCharacteristic(Characteristic.SecuritySystemTargetState, Characteristic.SecuritySystemTargetState.AWAY_ARM);
            break;
          case "alarm":
            hkService.setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
            break;
        };

        hkService.getCharacteristic(Characteristic.SecuritySystemTargetState)
          .on('set', async (state, callback)=>{
            switch (state) {
              case Characteristic.SecuritySystemTargetState.STAY_ARM:
                await ss.set_Alarm_State("home");
                break;
              case Characteristic.SecuritySystemTargetState.AWAY_ARM:
                await ss.set_Alarm_State("away");
                break;
              case Characteristic.SecuritySystemTargetState.DISARM:
                await ss.set_Alarm_State("off");
                break;
            };
            callback(null);
          })
          break;

        case ss.DeviceIds.camera: // Cameras
          if (!hkAccessory.getService(Service.CameraControl)) hkAccessory.addService(Service.CameraControl);
          if (!hkAccessory.getService(Service.Microphone)) hkAccessory.addService(Service.Microphone);
          if (!hkAccessory.getService(Service.MotionSensor)) hkAccessory.addService(Service.MotionSensor);
          hkAccessory.services.filter(service => service.UUID === Service.CameraRTPStreamManagement.UUID).map(service => { hkAccessory.removeService(service) });
          hkAccessory.configureCameraSource(new CameraSource(ssAccessory, UUIDGen, StreamController, this.log));
          break;

        case ss.DeviceIds.doorLock: // Door locks handled like basestation
          if (!hkAccessory.getService(Service.LockMechanism)) hkAccessory.addService(Service.LockMechanism);
          hkService = hkAccessory.getService(Service.LockMechanism);

          if (ssAccessory.status.lockState==1) {
            hkService.setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED);
            hkService.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.SECURED);
          } else if (ssAccessory.status.lockState==2) {
            hkService.setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.UNSECURED);
            hkService.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.UNSECURED);
          } ;
          
          if (ssAccessory.status.lockJamState) {
            hkService.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.JAMMED);
          };
          if (ssAccessory.status.lockDisabled) {
            hkService.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.UNKNOWN);
          };

          hkService.getCharacteristic(Characteristic.LockTargetState)
          .on('set', async (state, callback) => {
            if (state==Characteristic.LockTargetState.SECURED){
              await ss.set_Lock_State(ssAccessory.serial, 'lock');
              
            } else if (state==Characteristic.LockTargetState.UNSECURED) {
              await ss.set_Lock_State(ssAccessory.serial, 'unlock');

            };
            callback(null);
          });      
          break;

        default: //All the reset Accessories
          if (!hkAccessory.getService(this.serviceConvertSStoHK(ssAccessory.type))) hkAccessory.addService(this.serviceConvertSStoHK(ssAccessory.type));
          hkService = hkAccessory.getService(this.serviceConvertSStoHK(ssAccessory.type))
          if (ssAccessory.flags.lowBattery !== undefined) hkService.setCharacteristic(Characteristic.StatusLowBattery, ssAccessory.flags.lowBattery);
          hkService.getCharacteristic(this.characteristicConvertSStoHK(ssAccessory.type))
          .on('get', async (callback) => {
            if (ssAccessory.type == ss.DeviceIds.freezeSensor) {
              callback(null, (ssAccessory.status.temp - 32) * 5/9);
            } else {
              callback(null, ssAccessory.status.triggered);
            };
          });
      };

      hkAccessory.on('identify', function(paired, callback) {
        console.log(`${hkAccessory.displayName} identified and added.`);
        callback(null); // success
      });
    };
  };// End Of Function updateSS 
    
}; // End Of Class SimpliSafe

