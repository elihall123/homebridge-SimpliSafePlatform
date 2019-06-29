//homebridge-platform-simplisafe
var API = require('./client/api.js');

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
  constructor(log, config, api) {
    var platform = this;
    platform.log = log;
    platform.config = config;
    platform.accessories = {};
    ss = new API(config.SerialNumber, config.username, log);
    platform.refreshing_Sensors_Timer = 0;
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

        //if (platform.config.password){
          ss.apiconfig()
          .then(function(){
            ss.login_via_credentials(config.password)
            .then(function(){
              //if (!platform.config.refresh_token) platform.tokenCheck();
              return platform.initPlatform(false);
            });
          });
        /*} else if (platform.config.refresh_token) {
          ss.apiconfig()
          .then(function(){
            ss.login_via_token(config.refresh_token)
            .then(function(){
              return platform.initPlatform(false);
            });
          });
        } else {
          platform.log('Missing Password')
        };*/

        platform.log("Up and monitoring.");

      }.bind(platform));
    };
  };//End of SimpliSafe Function

  async initPlatform() {
    var platform = this;
    var system = ss.sensors;
    //Add in cameras;
    /*Object.keys(ss.cameras).forEach (camera=>{
      system[camera.uid] = {'type:': ss.SensorType.Camera, 'serial':camera.uid, 'name': camera.cameraSettings.cameraName};
    })
    */
    //Add the security alarm system as a sensor;
    system[platform.config.SerialNumber] = {'type': ss.SensorTypes.SecuritySystem, 'serial': platform.config.SerialNumber, 'name': 'SimpliSafe Alarm System'}
    Object.keys(system).forEach(sensor=> {
      //found Accessory to Sensor return to continue searching and change Reachability to true
      if (platform.accessories[sensor]) return platform.accessories[sensor].updateReachability(true);
        //found new sensor add it as an accessory
        if (ss.sysVersion == 3) {
          if (![ss.SensorTypes.CarbonMonoxideSensor, ss.SensorTypes.ContactSensor, ss.SensorTypes.GlassBreakSensor, ss.SensorTypes.LeakSensor, ss.SensorTypes.MotionSensor, ss.SensorTypes.SecuritySystem, ss.SensorTypes.SmokeSensor, ss.SensorTypes.TemperatureSensor].includes(ss.sensors[sensor].type)) return;
          platform.addAccessory(platform.createAccessory(sensor), true);
        } else {
          if (![ss.SensorTypes.ContactSensor, ss.SensorTypes.SecuritySystem, ss.SensorTypes.TemperatureSensor].includes(ss.sensors[sensor].type)) return;
          platform.addAccessory(platform.createAccessory(sensor), true);
        };
    });
  };// End of initPlatform Function

  tokenCheck(){
    var platform = this;
    if (ss._refresh_token) {
      if (platform.config.password) {
        var fs = require('fs');
        var cfg = JSON.parse(fs.readFileSync(User.configPath()));
        var nPlatforms=[];
        cfg.platforms.forEach(pForm=>{
          if (pForm.platform == 'homebridge-simplisafeplatform') {
            platform.log('Updating configuration file for token')
            delete pForm.password;
            pForm.refresh_token = ss._refresh_token;
          }
          nPlatforms.push(pForm);
        })
        cfg.platforms = nPlatforms;
        fs.writeFileSync(User.configPath(), JSON.stringify(cfg, null, 4));
      }
    };
  }//End of Toekn Check

  createAccessory(sensor) {
    var platform = this;

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
    return newAccessory;
  };// End createAccessory function

  configureAccessory(accessory) {
    var platform = this;
    accessory.reachable = true; // will turn to true after validated
    platform.addAccessory(accessory);
  }

  addAccessory(accessory, publish = false) {
    var platform = this;
      accessory.on('identify', (paired, callback) => {
                platform.log(accessory.displayName, 'Added!!!');
                callback();
      });

      if(accessory.getService(Service.CarbonMonoxideSensor)) {
          accessory.getService(Service.CarbonMonoxideSensor)
            .getCharacteristic(Characteristic.CarbonMonoxideDetected)
            .on('get', async (callback)=>{
              await platform.getState(accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.SerialNumber).value.toString(), callback);
            });
      } else if(accessory.getService(Service.ContactSensor)) {
          accessory.getService(Service.ContactSensor)
            .getCharacteristic(Characteristic.ContactSensorState)
            .on('get', async (callback)=>{
              await platform.getState(accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.SerialNumber).value.toString(), callback)
            });
      } else if(accessory.getService(Service.LeakSensor)) {
          accessory.getService(Service.LeakSensor)
            .getCharacteristic(Characteristic.LeakDetected)
            .on('get', async (callback)=>{
              await platform.getState(accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.SerialNumber).value.toString(), callback)
            });
      } else if (accessory.getService(Service.MotionSensor) && accessory.getService(Service.GlassBreakSensor)) {
          accessory.getService(Service.MotionSensor)
            .getCharacteristic(Characteristic.MotionDetected)
            .on('get', async (callback)=>{
              await platform.getState(accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.SerialNumber).value.toString(), callback);
            });
      } else if (accessory.getService(Service.SecuritySystem)) {
          accessory.getService(Service.SecuritySystem)
            .getCharacteristic(Characteristic.SecuritySystemCurrentState)
            .on('get', (callback)=>platform.getCurrentState(callback));
          accessory.getService(Service.SecuritySystem)
            .getCharacteristic(Characteristic.SecuritySystemTargetState)
            .on('get', (callback)=>platform.getAlarmState(callback))
            .on('set', (state,callback)=>{
                platform.setAlarmState(state,callback);
                accessory.getService(Service.SecuritySystem)
                  .setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
            });
      } else if (accessory.getService(Service.SmokeSensor)) {
          accessory.getService(Service.SmokeSensor)
            .getCharacteristic(Characteristic.SmokeDetected)
            .on('get', async (callback)=>{
              await platform.getState(accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.SerialNumber).value.toString(), callback);
            });
      } else if (accessory.getService(Service.TemperatureSensor)) {
          accessory.getService(Service.TemperatureSensor)
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', async (callback)=>{
              await platform.getState(accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.SerialNumber).value.toString(), callback);
            });
      };

      platform.accessories[accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.SerialNumber).value.toString()] = accessory;

      if (publish) {
        platform.log('publishing a new platform accessory', accessory.displayName);
        platform.api.registerPlatformAccessories("homebridge-simplisafeplatform", "homebridge-simplisafeplatform", [accessory]);
      }
  }// End Of Function addAccessory

  async getCurrentState(callback) {
    var platform = this;
    ss.get_Alarm_State()
    .then(function(state) {
      if (state.isAlarming) {
        callback(null, Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
      }
      switch (state.alarmState.toString().toLowerCase()) {
          case 'home':
          case 'home_count':
            callback(null, Characteristic.SecuritySystemCurrentState.STAY_ARM);
            break;
          case 'away':
          case 'away_count':
          case 'alarm_count':
            callback(null, Characteristic.SecuritySystemCurrentState.AWAY_ARM);
            break;
          case 'off':
            callback(null, Characteristic.SecuritySystemCurrentState.DISARMED);
            break;
        };
      }, function() {
          callback(new Error('Failed to get alarm state'))
      });
  }; // End Of Function getCurrentState

  async getState(SerialNumber, callback) {
    var platform = this;
    var count=0; // failout just incase....
    if (!ss.refreshing_Sensors){
      if ((platform.refreshing_Sensors_Timer + (platform.config.refresh_timer * 1000)) <= Date.now()) {
        platform.log('Refreshing Sensors Data');
        await ss.get_Sensors(false);
        platform.refreshing_Sensors_Timer = Date.now();
      };
    }

    var refreshing = setInterval(()=>{
      if ((platform.config.refresh_timer*2)>=count) ss.refreshing_Sensors = false; else count ++;
      if (ss.refreshing_Sensors==false) {
        clearInterval(refreshing);
        if (platform.accessories[SerialNumber].getService(Service.TemperatureSensor)) {
          if (ss.sysVersion == 3) {
            callback(null, (ss.sensors[SerialNumber]['status']['temperature']-32)*5/9);
          } else {
            callback(null, (ss.sensors[SerialNumber].temp-32)*5/9);
          }              
        } else {
          callback(null, ss.sensors[SerialNumber]['status']['triggered']);
        };
      };
    }, 500);
  };// End of Function getState

  async getAlarmState(callback) {
    var platform = this;
    ss.get_Alarm_State()
    .then(function(state) {
      switch (state.alarmState.toString().toLowerCase()) {
          case 'home':
          case 'home_count':
            callback(null, Characteristic.SecuritySystemTargetState.STAY_ARM);
            break;
          case 'away':
          case 'away_count':
          case 'alarm_count':
            callback(null, Characteristic.SecuritySystemTargetState.AWAY_ARM);
            break;
          case 'off':
            callback(null, Characteristic.SecuritySystemTargetState.DISARM);
            break;
        };
      }, function() {
          callback(new Error('Failed to get alarm state'))
      });
  };// End of Function getAlarmState

  async setAlarmState(state, callback) {
    // Set state in simplisafe 'off' or 'home' or 'away'
    var platform = this;
    var ssState;
    switch (state) {
      case Characteristic.SecuritySystemTargetState.STAY_ARM:
      case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
        ssState = "home";
        break;
      case Characteristic.SecuritySystemTargetState.AWAY_ARM :
        ssState = "away";
        break;
      case Characteristic.SecuritySystemTargetState.DISARM:
        ssState = "off";
        break;
    }
    ss.set_Alarm_State(ssState)
    .then(function() {
      callback(null, state);
    }, function() {
        callback(new Error('Failed to set target state to ' + state));
    });
  };// End of Function setAlarmState

}; // End Of Class
