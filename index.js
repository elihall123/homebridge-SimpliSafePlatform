//homebridge-platform-simplisafe
var API = require('./client/api');

var Accessory, Service, Characteristic, UUIDGen, User;

module.exports = function(homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  User = homebridge.user;
    
  homebridge.registerPlatform("homebridge-simplisafeplatform", "homebridge-simplisafeplatform", SimpliSafe, true);
}

var ss; //SimpliSafe Client

class SimpliSafe {
  
  prepareAccessory(accessory, publish = false) {
    var platform = this;
      accessory.on('identify', (paired, callback) => {
                platform.log(accessory.displayName, 'Added!!!');
                callback();
      });

      if (accessory.getService(Service.SecuritySystem)) {
          accessory.getService(Service.SecuritySystem)
            .getCharacteristic(Characteristic.SecuritySystemTargetState)
            .on('set', async (state, callback)=>{
              //platform.setAlarmState(state, callback);
              switch (state) {
                case Characteristic.SecuritySystemTargetState.STAY_ARM:
                case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
                  await ss.set_Alarm_State("home");
                  break;
                case Characteristic.SecuritySystemTargetState.AWAY_ARM :
                  await ss.set_Alarm_State("away");
                  break;
                case Characteristic.SecuritySystemTargetState.DISARM:
                  await ss.set_Alarm_State("off");
                  break;
              };
              callback(null, state);
              accessory.getService(Service.SecuritySystem).setCharacteristic(Characteristic.SecuritySystemCurrentState, state);         
            });
      };

      platform.accessories[accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.SerialNumber).value.toString()] = accessory;

      if (publish) {
        platform.log('publishing a new platform accessory', accessory.displayName);
        platform.api.registerPlatformAccessories("homebridge-simplisafeplatform", "homebridge-simplisafeplatform", [accessory]);
      }
  };// End Of Function addAccessory

  configureAccessory(accessory) {
    var platform = this;
    accessory.reachable = false; // will turn to true after validated
    platform.prepareAccessory(accessory);
  };// End Of Function configureAccessory

  setAlarmState(state,callback){
    callback(null, state);

  };

  constructor(log, config, api) {
    var platform = this;
    platform.log = log;
    platform.config = config;
    platform.accessories = {};
    ss = new API(config.SerialNumber, config.username, log);
    platform.refreshing_Sensors_Timer = Date.now();
    platform.refreshing_Sensors = false;

    if (api) {
      platform.api = api;
      platform.api.on('didFinishLaunching', function() {
        if (platform.config.reset) {
          var fs = require('fs');
          var cfg = JSON.parse(fs.readFileSync(User.configPath()));
          var nPlatforms=[];
          cfg.platforms.forEach(pForm=>{
            if (pForm.platform == 'homebridge-simplisafeplatform') {
              platform.log('Clearing cache of SimpliSafe accesories');
              delete pForm.reset;
              this.api.unregisterPlatformAccessories("homebridge-simplisafeplatform", "homebridge-simplisafeplatform", platform.accessories);
              platform.accessories = {};
            }
            nPlatforms.push(pForm);
          })
          cfg.platforms = nPlatforms;
          fs.writeFileSync(User.configPath(), JSON.stringify(cfg, null, 4));
        }

        ss.API_Config()
        .then(function(){
          ss.login_via_credentials(config.password)
          .then(function(){
            platform.log('Up and Monitoring');
            return platform.initPlatform(false);
          });
        });

        setInterval(()=>{
          ss.get_Alarm_State()
          .then ((status)=>{
            if (status.isAlarming) platform.accessories[platform.config.SerialNumber].getService(Service.SecuritySystemCurrentState).getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
            switch (status.alarmState.toLowerCase()) {
              case "home":
              case 'home_count':
                  platform.accessories[platform.config.SerialNumber].getService(Service.SecuritySystem).getCharacteristic(Characteristic.SecuritySystemTargetState).updateValue(Characteristic.SecuritySystemTargetState.STAY_ARM);
                  platform.accessories[platform.config.SerialNumber].getService(Service.SecuritySystem).getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(Characteristic.SecuritySystemCurrentState.STAY_ARM);
                break;
              case "away":
              case 'away_count':
              case 'alarm_count':
                platform.accessories[platform.config.SerialNumber].getService(Service.SecuritySystem).getCharacteristic(Characteristic.SecuritySystemTargetState).updateValue(Characteristic.SecuritySystemTargetState.AWAY_ARM);
                platform.accessories[platform.config.SerialNumber].getService(Service.SecuritySystem).getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(Characteristic.SecuritySystemCurrentState.AWAY_ARM);
                break;
              case "off":
                platform.accessories[platform.config.SerialNumber].getService(Service.SecuritySystem).getCharacteristic(Characteristic.SecuritySystemTargetState).updateValue(Characteristic.SecuritySystemTargetState.DISARMED);
                platform.accessories[platform.config.SerialNumber].getService(Service.SecuritySystem).getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(Characteristic.SecuritySystemCurrentState.DISARMED);
                break;
            };
          });
          
          ss.get_Sensors(false)
          .then((sensors)=>{
            Object.keys(sensors).forEach((sensor) => {
              if (![
                ss.SensorTypes.CarbonMonoxideSensor,
                ss.SensorTypes.ContactSensor,
                ss.SensorTypes.GlassBreakSensor,
                ss.SensorTypes.LeakSensor,
                ss.SensorTypes.MotionSensor,
                ss.SensorTypes.SmokeSensor,
                ss.SensorTypes.TemperatureSensor
              ].includes(sensors[sensor].type)) return;

              Object.keys(platform.accessories).forEach(accessory => {
                accessory = platform.accessories[accessory];
                if (accessory.context.SerialNumber != sensor) return;
                
                switch (sensors[sensor].type) {
                  case ss.SensorTypes.CarbonMonoxideSensor:
                    accessory.getService(Service.CarbonMonoxideSensor).getCharacteristic(Characteristic.CarbonDioxideDetected).updateValue(sensors[sensor].status.triggered);
                    break;
                  case ss.SensorTypes.ContactSensor:
                    accessory.getService(Service.ContactSensor).getCharacteristic(Characteristic.ContactSensorState).updateValue(sensors[sensor].status.triggered);
                    break;
                  case ss.SensorTypes.GlassBreakSensor:
                    accessory.getService(Service.MotionSensor).getCharacteristic(Characteristic.MotionDetected).updateValue(sensors[sensor].status.triggered);
                    break;
                  case ss.SensorTypes.LeakSensor:
                    accessory.getService(Service.LeakSensor).getCharacteristic(Characteristic.LeakDetected).updateValue(sensors[sensor].status.triggered);
                    break;
                  case ss.SensorTypes.MotionSensor:
                    accessory.getService(Service.MotionSensor).getCharacteristic(Characteristic.MotionDetected).updateValue(sensors[sensor].status.triggered);
                    break;
                  case ss.SensorTypes.SmokeSensor:
                    accessory.getService(Service.SmokeSensor).getCharacteristic(Characteristic.SmokeDetected).updateValue(sensors[sensor].status.triggered);
                    break;
                  case ss.SensorTypes.TemperatureSensor:
                    accessory.getService(Service.TemperatureSensor).getCharacteristic(Characteristic.CurrentTemperature).updateValue((sensors[sensor].status.temperature-32) * 5/9);
                    break;
                };
              });
            });
          });
        }, (platform.config.refresh_timer * 1000));

      }.bind(platform));
    };
  };//End Of Function SimpliSafe 
 
  async initPlatform() {
    var platform = this;
    var system = ss.sensors;
    //Add in cameras;
    /*Object.keys(ss.cameras).forEach (camera=>{
      system[camera.uid] = {'type:': ss.SensorType.Camera, 'serial':camera.uid, 'name': camera.cameraSettings.cameraName};
    })
    */
    //Add the security alarm system as a sensor;
    system[platform.config.SerialNumber] = {'type': ss.SensorTypes.SecuritySystem, '\nserial': platform.config.SerialNumber, '\nname': 'SimpliSafe Alarm System'}
    Object.keys(system).forEach(sensor=> {
      //found Accessory to Sensor return to continue searching and change Reachability to true
      if (platform.accessories[sensor]) return platform.accessories[sensor].updateReachability(true);
        //found new sensor add it as an accessory
        if ([ss.SensorTypes.CarbonMonoxideSensor, ss.SensorTypes.ContactSensor, ss.SensorTypes.GlassBreakSensor, ss.SensorTypes.LeakSensor, ss.SensorTypes.MotionSensor, ss.SensorTypes.SecuritySystem, ss.SensorTypes.SmokeSensor, ss.SensorTypes.TemperatureSensor].includes(ss.sensors[sensor].type)) {
          let newAccessory = new Accessory(ss.SensorTypes[ss.sensors[sensor].type] + ' ' + sensor.toString(), UUIDGen.generate(ss.SensorTypes[ss.sensors[sensor].type] + ' ' + sensor));
          newAccessory.reachable = true;
          newAccessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.SerialNumber, sensor)
            .setCharacteristic(Characteristic.Manufacturer, 'SimpliSafe')
            .setCharacteristic(Characteristic.Model, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Sensor'));
      
          switch (ss.sensors[sensor].type) {
            case ss.SensorTypes.CarbonMonoxideSensor:
              newAccessory.addService(Service.CarbonMonoxideSensor, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Detector'));
              break;
            case ss.SensorTypes.ContactSensor:
              newAccessory.addService(Service.ContactSensor, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Sensor'));
              break;
            case ss.SensorTypes.GlassBreakSensor:
                newAccessory.addService(Service.MotionSensor, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Sensor'));
                break;
            case ss.SensorTypes.LeakSensor:
                newAccessory.addService(Service.LeakSensor, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Detector'));
                break;
            case ss.SensorTypes.MotionSensor:
              newAccessory.addService(Service.MotionSensor, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Sensor'));
              break;
            case ss.SensorTypes.SecuritySystem:
                newAccessory.addService(Service.SecuritySystem, "SimpliSafe Security System");
                break;
            case ss.SensorTypes.SmokeSensor:
              newAccessory.addService(Service.SmokeSensor, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Detector'));
              break;
            case ss.SensorTypes.TemperatureSensor:
              newAccessory.addService(Service.TemperatureSensor, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Sensor'));
              break;
          };
          platform.prepareAccessory(newAccessory, true);      
        };

    });
  };// End Of Function initPlatform 
    
}; // End Of Class SimpliSafe
