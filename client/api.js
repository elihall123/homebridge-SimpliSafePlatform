var websession = require('https');

var fs = require('fs');
var vm = require('vm');
var io = require("socket.io-client");

var _access_token;
var _access_token_expire;
var _access_token_type;
var _email;

module.exports = class API {
  //Class SimpliSafe API
  async _Authenticate(payload_data){
    //Request token data...
    var self = this;
    var resp = await self.request({
      method:'POST',
      endpoint:'api/token',
      data: payload_data,
      auth: "Basic: " + Buffer.from(self.uuid + ".2074.0.0.com.simplisafe.mobile" + ':').toString('base64'),
    });

    _access_token = resp.access_token;
    _access_token_expire = Date.now() + ((resp.expires_in-60) * 1000);
    _access_token_type = resp.token_type;
    self._refresh_token = resp.refresh_token;
  };//End Of Function _authenticate

  async _get_UserID (){
    var self = this;
    var resp = await self.request({method:'GET',endpoint: 'api/authCheck'})
    self.user_id = resp['userId'];
  };//End Of Function _getUserId

  async _Refresh_Access_Token(refresh_token){
    //Regenerate an access token.
    var self = this;
    self.log("Regenerating Access Token");
    await self._Authenticate({'grant_type': 'refresh_token', 'username': _email, 'refresh_token': refresh_token,})
    self._actively_refreshing = false;
  };//End Of Function _refresh_access_token

  async API_Config() {
    var self = this;
    var resp = await webResponse(new URL('https://webapp.simplisafe.com/ssAppConfig.js'), {METHOD: 'GET'})
    resp = resp.body.replace('})(window);', 'return g;});')
                .replace('var a=', 'var a=g.')
                .replace(';', '');
    let APICFGS = vm.runInThisContext(resp);
    APICFGS(self);
  };//End Of Function API_Config

  constructor(SerialNumber, email, log) {
    //Initialize.
    var self = this;
    if (!log) {self.log = console.log;} else {self.log = log;}
    _email = email;
    self.refresh_token_dirty = false;
    self.serial = SerialNumber;
    self.user_id;
    self.uuid = uuid4();
    self._refresh_token = '';
    self._actively_refreshing = false;
    self.cameras = {};
    self.ssDeviceIds = {
      unknown: -1,
      baseStation: 0,
      keypad: 1,
      keychainRemote: 2,
      panicButton: 3,
      motionSensor: 4,
      entrySensor: 5,
      glassbreakSensor: 6,
      coDetector: 7,
      smokeDetector: 8,
      waterSensor: 9,
      freezeSensor: 10,
      siren: 11,
      camera: 1e3,
      nest: 2e3
    };

    this.ssSystemStates= {
      unknown: "unknown",
      off: "off",
      home: "home",
      away: "away",
      alarm: "alarm",
      home_count: "home_count",
      away_count: "away_count",
      alarm_count: "alarm_count"
    };

    this.ssEventContactIds= {
      unknown: "0000",
      alarmSmokeDetectorTriggered: "1110",
      alarmWaterSensorTriggered: "1154",
      alarmFreezeSensorTriggered: "1159",
      alarmCoSensorTriggered: "1162",
      alarmEntrySensorTriggered: "1134",
      alarmMotionOrGlassbreakSensorTriggered: "1132",
      alarmPanicButtonTriggered: "1120",
      alarmCanceled: "1406",
      alarmSmokeDetectorStopped: "3110",
      alarmWaterSensorStopped: "3154",
      alarmFreezeSensorStopped: "3159",
      alarmCoSensorStopped: "3162",
      systemPowerOutage: "1301",
      systemPowerRestored: "3301",
      systemInterferenceDetected: "1344",
      systemInterferenceResolved: "3344",
      sensorError: "1381",
      sensorRestored: "3381",
      systemArmed: "3400",
      systemArmedHome: "3441",
      systemArmedAway: "3401",
      systemDisarmed: "1400",
      alertSecret: "1409",
      userRecording: "1609",
      cameraRecording: "1170",
      doorbellRang: "1458",
      testSignalReceivedUser: "1601",
      testSignalReceivedSensor: "1604",
      testSignalReceivedAuto: "1602",
      alarmOther: "1140",
      alarmHeatSensorTriggered: "1158",
      alarmHeatSensorStopped: "3158",
      medicalAlarm: "1100",
      systemAwayRemote: "3407",
      systemHome2: "3491",
      systemAway2: "3481",
      systemAway2Remote: "3487",
      batteryLow: "1302",
      batteryRestored: "3302",
      wiFiOutage: "1350",
      wiFiRestored: "3350",
      sensorPaired: "1531",
      otaDownloaded: "1416",
      entryDelay: "1429",
      warningSensorOpen: "1426",
      systemOff: "1407",
      systemHomeCount: "9441",
      systemAwayCount: "9401",
      systemAwayCountRemote: "9407",
      sensorAdded: "1531",
      sensorNamed: "1533",
      wiFiUpdateSuccess: "3360",
      wiFiUpdateFailure: "1360"
    };
    
    self.API_Config();
  };//End Of Function Constructor

  async get_Alarm_State() {
    var self = this;
    return await self.get_System();
  };//End Of Function get_Alarm_State

  async get_Camera_Stream(uuid){
    var self = this;
    if (!self.simplisafe) await self.API_Config();
    if (_access_token_expire && Date.now() >= _access_token_expire && self._actively_refreshing == false){
            self._actively_refreshing = true;
            await self._refresh_access_token(self._refresh_token);
    }

    var url = new URL(self.simplisafe.webapp.mediaHost + self.simplisafe.webapp.mediaPath + '/' + uuid + '/flv');

    headers={
      Authorization: _access_token_type + ' ' + _access_token,
      Accept: application/json
    };

    var options = {
      method: method,
      headers: headers
    }
    var resp = await webResponse(url, options, data);
    return resp.body;

  };//End Of Function get_Camera_Stream

  async get_System(){
    //Get systems associated to this account.
    var self = this;
    try{
      var resp = await self.request({method: 'GET', endpoint: 'users/' + self.user_id + '/subscriptions', params: {'activeOnly': 'true'}});
      for (var system_data of resp.subscriptions){
        if (system_data.location.system.serial === self.serial) {
            self.subId = system_data.sid;
            self.sysVersion = system_data.location.system.version;
            for (var camera of system_data.location.system.cameras){
              self.cameras[camera.uuid] = camera;
            }
            return system_data.location.system;
          }
      };
    } catch (e) {
            self.log('Get_System',e);
            return false;
    };
  };//End Of Function get_System

  async get_Sensors(cached = true) {
    var self = this;
    var resp = await self.request({
      method:'GET',
      endpoint:'ss3/subscriptions/' + self.subId + '/sensors',
      params:{'forceUpdate': (cached==false).toString().toLowerCase()} //false = coming from cache
    })
    return resp.sensors;
  };//End Of Function get_Sensors

  async login_via_credentials(password){
    //Create an API object from a email address and password.
      var self = this;
      await self._Authenticate({'grant_type': 'password', 'username': _email, 'password': password});
      await self._get_UserID();
      return;
  };//End Of Function login_via_credentials
  
  async get_SokectEvents(callback) {
    var self = this;
    /*        DATA: {
            "eventTimestamp":1567686989,
            "eventCid":9407,
            "zoneCid":"0",
            "sensorType":0,
            "sensorSerial":"",
            "account":"",
            "userId":,
            "sid":,
            "info":"Exit Delay Countdown Triggered for Away Mode Remotely",
            "pinName":"",
            "sensorName":"",
            "messageSubject":"",
            "messageBody":"",
            "eventType":"activityQuiet",
            "timezone":0,
            "locationOffset":-240,
            "expires":60,
            "internal":{"dispatcher":"cops","shouldNotify":false},
            "senderId":"wifi",
            "eventId":6170934771,
            "serviceFeatures":{"monitoring":true,"alerts":true,"online":true,"video":false,"hazard":false},
            "copsVideoOptIn":true,
            "video":{
              "uuid":{"clipId":stampdt,"preroll":5,"postroll":45,"cameraName":"name"},
              "uuid":{"clipId":stampdt,"preroll":5,"postroll":45,"cameraName":"name"},
              "uuid":{"clipId":stampdt,"preroll":5,"postroll":45,"cameraName":"name"}
            },
            "exitDelay":60
          }
*/

    if (!self.socket) {
        try {
            self.socket = io(`${self.simplisafe.webapp.apiHost}${self.simplisafe.webapp.apiPath}/user/${self.user_id}`, {
              path: '/socket.io',
              query: {
                ns: `/v1/user/${self.user_id}`,
                accessToken: _access_token
              },
              transports: ['websocket']
            });

            self.socket.on('connect', () => {
              self.log('Event socket is up and monitoring');
            });

            self.socket.on('connect_error', err => {
                self.log("Socket", 'Connect_error', err);
                self.socket = null;
            });

            self.socket.on('connect_timeout', () => {
                self.log("Socket", 'Connect_timeout');
                self.socket = null;
            });

            self.socket.on('error', err => {
              self.log("Socket", 'error', err);
              self.socket = null;
            });

            self.socket.on('disconnect', reason => {
                if (reason === 'transport close') {
                  callback('DISCONNECT');
                }
                self.socket = null;
            });

            self.socket.on('reconnect_failed', () => {
              //self.log("Socket", 'failed reconnect');
              self.socket = null;
            });

            self.socket.on('hiddenEvent', data => {
              callback(data);
            });    

            self.socket.on('event', data => {
              //self.log("Socket", data);
              callback(data);
            });

            self.socket.on('cameraEvent', data => {
              //self.log("Socket", 'camera', data);
            });

        } catch (err) {
            throw err;
        }
    }
  };//End of Function get_SokectEvents

  async request({method='', endpoint='', headers={}, params={}, data={}, json={}, ...kwargs}){
    var self = this;
    if (!self.simplisafe) await self.API_Config();
    var refreshing = await setInterval(()=>{if (!self._actively_refreshing)  clearInterval(refreshing);}, 500);

    if (_access_token_expire && Date.now() >= _access_token_expire && !self._actively_refreshing){
      self._actively_refreshing = true;
      await self._Refresh_Access_Token(self._refresh_token);
    }

    var url = new URL(self.simplisafe.webapp.apiHost + self.simplisafe.webapp.apiPath + '/' + endpoint);

    if (params){
      Object.keys(params).forEach(item=> {
          url.searchParams.append(item.toString(), params[item]);
      });
    };

    if (!kwargs.auth) headers['Authorization'] = _access_token_type + ' ' + _access_token; else headers['Authorization'] = kwargs.auth;

    headers={
            ...headers,
            'Content-Type': 'application/json; charset=utf-8',
            "User-Agent": "SimpliSafe/2105 CFNetwork/902.2 Darwin/17.7.0"
    };

    var options = {
      method: method,
      headers: headers
    }
    var resp = await webResponse(url, options, data);
    self.cookie = resp.cookie;
    if (resp.statusCode == 401 && !self._actively_refreshing) {
      self._actively_refreshing = true;
      await self._Refresh_Access_Token(self._refresh_token);
      return resp.statusCode;
    } else {
      return resp.body;
    }
  };//End Of Function Request

  async set_Alarm_State(value) {
  var self = this;
      return await self.request({
       method:'post',
       endpoint:'ss3/subscriptions/' + self.subId + '/state/' + value
      })
  };//End Of Function set_Alarm_State

};//End Of Class API

function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

async function webResponse(url, options, data){
  return new Promise(async (resolve, reject) => {
    const req = await websession.request(url.href, options, (res) => {
      var ret = {};
      var body = '';
      ret = {statusCode: res.statusCode};
      ret = {...ret,
              'headers': res.headers}
      if (res.headers['set-cookie']) ret = {...ret, 'cookie': res.headers['set-cookie']}
      if (res.headers['content-encoding'] && res.headers['content-encoding'].indexOf('gzip') > -1) {
        var zlib = require("zlib");
        var gunzip = zlib.createGunzip();
        res.pipe(gunzip);

        gunzip.on('data', function(data) {
          ret = {...ret,
                'body': data.toString()
          }      
          resolve(ret);
        });
      } else {
        //if (res.headers['content-type'].indexOf('utf-8') > -1) res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk;}) ;
        res.on('end', () => {
          if (typeof res.headers['content-type']!=='undefined' && res.headers['content-type'].indexOf('application/json') > -1) {
            ret = {...ret,
                    'body': JSON.parse(body)
            }
            resolve(ret);
          } else {
            ret = {...ret,
                  'body': body
            }
            resolve(ret);
          }
        });
      };
    });

    req.on('error', (e) => {
      console.error(`problem with request: ${e.message}`);
    });

    if (data) req.write(JSON.stringify(data));
    req.end();
  });
};//End Of Function webResponse
