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

function SimpliSafe(log, config, api) {
  var platform = this;
  platform.log = log;
  platform.config = config;
  platform.accessories = [];
  var ssClient = new API(log);
  ss = new API(config.SerialNumber, config.username);

  if (api) {
    platform.api = api;
    platform.api.on('didFinishLaunching', function() {

      if (platform.config.password){
        ss.login_via_credentials(config.password)
        .then(function(){
          return platform.updateSensors(false);
        });
      } else {
        ss.login_via_token(config.refresh_token)
        .then(function(){
          return platform.updateSensors(false);
        });
      }
      platform.log("Up and monitoring.");
      setInterval(
        function(){
            platform.updateSensors();
        },
        (platform.config.refresh_timer * 1000)
      );
    }.bind(platform));
  }
}

SimpliSafe.prototype.updateSensors = function(cached = true){
  var platform = this;

  if (ss._refresh_token) {
    if (platform.config.password) {
      var fs = require('fs');
      var cfg = JSON.parse(fs.readFileSync(User.configPath()));
      var nPlatforms=[];
      cfg.platforms.forEach(pForm=>{
        if (pForm.platform == 'homebridge-simplisafeplatform') {
          delete pForm.password;
          pForm.refresh_token = ss._refresh_token;
        }
        nPlatforms.push(pForm);
      })
      cfg.platforms = nPlatforms;
      fs.writeFileSync(User.configPath(), JSON.stringify(cfg, null, 4));
    }
  }

  return ss.get_Sensors(cached)
    .then(function () {
      var system = ss.sensors;
      system[platform.config.SerialNumber] = {'type': ss.SensorTypes.SecuritySystem, 'serial': platform.config.SerialNumber, 'name': 'SimpliSafe Alarm System'}
      Object.keys(system).forEach(sensor=> {
        if (ss.sysVersion == 3) {
          if (![ss.SensorTypes.CarbonMonoxideSensor, ss.SensorTypes.ContactSensor, ss.SensorTypes.GlassBreakSensor, ss.SensorTypes.LeakSensor, ss.SensorTypes.MotionSensor, ss.SensorTypes.SecuritySystem, ss.SensorTypes.SmokeSensor, ss.SensorTypes.TemperatureSensor].includes(ss.sensors[sensor].type)) return;
          platform.getSensorsServices(sensor, platform.getAccessory(sensor));
        } else {
          if (![ss.SensorTypes.ContactSensor, ss.SensorTypes.SecuritySystem, ss.SensorTypes.TemperatureSensor].includes(ss.sensors[sensor].type)) return;
          platform.getSensorsServices(sensor, platform.getAccessory(sensor));
        }
      });
    })
    .catch(err=>{
      platform.log(err);
    });
}

SimpliSafe.prototype.getAccessory = function(sensor){
  var platform = this;
  var SystemAccessory;
  platform.accessories.forEach(accessory=> {
    if (accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.SerialNumber).value.toString() != sensor.toString()) return;
    SystemAccessory = accessory;
    SystemAccessory.updateReachability(true);
  });
  //Not found create a new one;

  if (!SystemAccessory) {
    platform.log('Found new sensor', ss.SensorTypes[ss.sensors[sensor].type], sensor, ss.sensors[sensor].name);
    SystemAccessory = new Accessory(ss.SensorTypes[ss.sensors[sensor].type] + ' ' + sensor.toString(), UUIDGen.generate(ss.SensorTypes[ss.sensors[sensor].type] + ' ' + sensor));
    SystemAccessory.context.SerialNumber = sensor;

    SystemAccessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.SerialNumber, sensor.toString())
      .setCharacteristic(Characteristic.Name, ss.sensors[sensor].name)
      .setCharacteristic(Characteristic.Manufacturer, 'SimpliSafe')
      .setCharacteristic(Characteristic.HardwareRevision, ss.sysVersion);

    platform.accessories.push(SystemAccessory);
    platform.api.registerPlatformAccessories("homebridge-simplisafeplatform", "homebridge-simplisafeplatform", [SystemAccessory]);
  }
  return SystemAccessory;
}

SimpliSafe.prototype.getSensorsServices = function(sensor, accessory){
  var platform = this;
  switch (ss.sensors[sensor].type) {
    case ss.SensorTypes.CarbonMonoxideSensor:
      if (!accessory.getService(Service.CarbonMonoxideSensor)) {
        accessory.addService(Service.CarbonMonoxideSensor, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Detector'));
        accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Model, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Sensor'));
      };
      accessory.getService(Service.CarbonMonoxideSensor).getCharacteristic(Characteristic.CarbonMonoxideDetected).updateValue(!ss.sensors[sensor]['status']['triggered'] ? false: true);
      break;
    case ss.SensorTypes.ContactSensor:
      if (!accessory.getService(Service.ContactSensor)) {
        accessory.addService(Service.ContactSensor, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Sensor'));
        accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Model, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Sensor'));
      };
      if (ss.sensors[sensor].entryStatus == 'closed') {
        accessory.getService(Service.ContactSensor).getCharacteristic(Characteristic.ContactSensorState).updateValue(Characteristic.ContactSensorState.CONTACT_DETECTED);
      } else {
        accessory.getService(Service.ContactSensor).getCharacteristic(Characteristic.ContactSensorState).updateValue(Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
      };
      break;
    case ss.SensorTypes.LeakSensor:
        if (!accessory.getService(Service.LeakSensor)) {
          accessory.addService(Service.LeakSensor, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Detector'));
          accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Model, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Sensor'));
        };
        accessory.getService(Service.LeakSensor).getCharacteristic(Characteristic.LeakDetected).updateValue(!ss.sensors[sensor]['status']['triggered'] ? false: true);
        break;
    case ss.SensorTypes.GlassBreakSensor:
    case ss.SensorTypes.MotionSensor:
      if (!accessory.getService(Service.MotionSensor)) {
        accessory.addService(Service.MotionSensor, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Detector'));
        accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Model, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Sensor'));
      };
      accessory.getService(Service.MotionSensor).getCharacteristic(Characteristic.MotionDetected).updateValue(!ss.sensors[sensor]['status']['triggered'] ? false: true);
      break;
    case ss.SensorTypes.SecuritySystem:
      if (!accessory.getService(Service.SecuritySystem)) {
        accessory.addService(Service.SecuritySystem, 'SimpliSafe Alarm System');
        accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Model, 'SimpliSafe Alarm System');
        accessory.getService(Service.SecuritySystem)
          .getCharacteristic(Characteristic.SecuritySystemCurrentState)
          .on('get', (callback)=>platform.getAlarmState(callback));
        accessory.getService(Service.SecuritySystem)
          .getCharacteristic(Characteristic.SecuritySystemTargetState)
          .on('get', (callback)=> platform.getAlarmState(callback))
          .on('set', (state, callback)=> {
             platform.setAlarmState(state, callback);
             accessory.getService(Service.SecuritySystem).setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
          });
      }
      ss.get_Alarm_State()
        .then(function(state) {
          if (state.isAlarming) accessory.getService(Service.SecuritySystem).setCharacteristic(Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
        });
      break;
    case ss.SensorTypes.SmokeSensor:
      if (!accessory.getService(Service.SmokeSensor)) {
        accessory.addService(Service.SmokeSensor, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Detector'));
        accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Model, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Sensor'));
      };
      accessory.getService(Service.SmokeSensor).getCharacteristic(Characteristic.SmokeDetected).updateValue(!ss.sensors[sensor]['status']['triggered'] ? false: true);
      break;
    case ss.SensorTypes.TemperatureSensor:
      if (!accessory.getService(Service.TemperatureSensor)) {
        accessory.addService(Service.TemperatureSensor, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Sensor'));
        accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Model, ss.SensorTypes[ss.sensors[sensor].type].replace('Sensor', ' Sensor'));
      };
      accessory.getService(Service.TemperatureSensor).getCharacteristic(Characteristic.CurrentTemperature).updateValue((ss.sensors[sensor].temp-32) * 5/9);
      break;
  };
}

SimpliSafe.prototype.getAlarmState = function(callback){
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
};

SimpliSafe.prototype.setAlarmState = function(state, callback) {
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
}

SimpliSafe.prototype.configureAccessory = function(accessory) {
  var platform = this;
  if (accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.SerialNumber).value.toString() == platform.config.SerialNumber.toString()) {
    accessory.getService(Service.SecuritySystem)
      .getCharacteristic(Characteristic.SecuritySystemCurrentState)
      .on('get', (callback)=>platform.getAlarmState(callback));
    accessory.getService(Service.SecuritySystem)
      .getCharacteristic(Characteristic.SecuritySystemTargetState)
      .on('get', (callback)=> platform.getAlarmState(callback))
      .on('set', (state, callback)=> {
         platform.setAlarmState(state, callback);
         accessory.getService(Service.SecuritySystem).setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
      });
  };

  accessory.reachable = true;
  platform.accessories.push(accessory);
}

// Sample function to show how developer can remove accessory dynamically from outside event
// Need to look up Accessoy Removal process....
//  this.api.unregisterPlatformAccessories("homebridge-platform-simplisafe", "homebridge-platform-simplisafe", this.accessories);

//  this.accessories = [];
