var websession = require('https');
var fs = require('fs');
var vm = require('vm');


function BasicAuth(login, password){
  return "Basic " +  Buffer.from(login + ':' + password).toString('base64');
}
var g = "4df55627-46b2-4e2c-866b-1521b395ded2",
    h = "WebApp";
    
function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

var _access_token;
var _access_token_expire;
var _access_token_type;
var _email;

module.exports = class API {
  //Class SimpliSafe API
  constructor(SerialNumber, email, log) {
    //Initialize.
    var self = this;
    self.log = log;
    _email = email;
    self.refresh_token_dirty = false;
    self.serial = SerialNumber;
    self.user_id;
    self._refresh_token = '';
    self.sensors = {};
    self._actively_refreshing = false;
    self.refreshing_Sensors = false;
    self.cameras = {};
    self.SensorTypes = {
      /*Commented out sensors not used by Homebridge and yes I know the siren could be a speaker*/
      0:'SecuritySystem',
      /*1:'keypad',
      2:'keychain',
      3:'panic_button',*/
      4:'MotionSensor',
      5:'ContactSensor',
      6:'GlassBreakSensor',
      7:'CarbonMonoxideSensor',
      8:'SmokeSensor',
      9:'LeakSensor',
      10:'TemperatureSensor',
      /*13:'siren',
      99:'unknown',*/

      'SecuritySystem': 0,
      /*'keypad': 1,
      'keychain': 2,
      'panic_button': 3,*/
      'MotionSensor': 4,
      'ContactSensor': 5,
      'GlassBreakSensor': 6,
      'CarbonMonoxideSensor': 7,
      'SmokeSensor': 8,
      'LeakSensor': 9,
      'TemperatureSensor': 10,
      /*'siren': 13,
      'unknown': 99*/
    };

  };//end of constructor

  async apiconfig() {
    var self = this;
    var resp = await webResponse(new URL('https://webapp.simplisafe.com/ssAppConfig.js'), {METHOD: 'GET'})
    resp = resp.body.replace('})(window);', 'return g;});')
                .replace('var a=', 'var a=g.')
                .replace(';', '');
    let APICFGS = vm.runInThisContext(resp);
    APICFGS(self);
  }

  getClientId() {
    try {
        var n = [];
        n.push(g), n.push("1.30.1".replace(/\./g, "-")), n.push(h);
        return n.join(".") + ".simplisafe.com";
    } catch (e) {
        this.log(e)
    }
  }

  getDeviceId() {
    try {
        var n = (new Date, 'useragent="2105 CFNetwork/902.2 Darwin/17.7.0"');
        n += '; uuid="' + g + '"';
        var r = h + "; " + n;
        return r
    } catch (e) {
        this.log(e)
    }
  }

  async websocket(){
    var self = this;
    try {
      /*var resp = await webResponse(new URL('https://cdnjs.cloudflare.com/ajax/libs/socket.io/1.5.1/socket.io.min.js'), {METHOD: 'GET'})
          await fs.writeFileSync('./socket.io.min.js', resp.body, (err) => {
            if (err) throw err;
          });
          var resp = await webResponse(new URL('https://cdnjs.cloudflare.com/ajax/libs/socket.io/1.5.1/socket.io.js'), {METHOD: 'GET'})
          await fs.writeFileSync('./socket.io.js', resp.body, (err) => {
            if (err) throw err;
          });*/
        var m = null, g = [], r = self.simplisafe.webapp, io = require('socket.io-client');
        /*fs.unlink('./socket.io.min.js', (err) => {
          if (err) throw err;
        });
        fs.unlink('./socket.io.js', (err) => {
          if (err) throw err;
        });*/
        m && (m.disconnect(), m = null);
        var n = r.apiPath + "/user/" + self.user_id;
        var AWSALB = self.cookie.toString().split(';', 1);
        var cookie = AWSALB + '; ssOauthAccessExpires=' + _access_token_expire + '; ssOauthAccessToken=' + encodeURIComponent(_access_token) + ';'

        m = io.connect(r.apiHost + n, {
            query: "ns=" + n + "&accessToken=" + encodeURIComponent(_access_token),
            resource: "socket.io",
            reconnection: !0,
            upgrade: !0,
            secure: !0,
            transport: "polling",
            rejectUnauthorized: false
        }),
        m.on("connect", socket => {
          self.log('Connect', socket);
        }),
        m.on("event", self.ssEvent),
        m.on("hiddenEvent", self.ssHiddenEvent), 
        m.on('connect_error', function(err){
          self.log('Connection error:', err, m);
        }),
        m.on('connection', socket => {
          self.log('Connection', socket);
        }),
        m.on('disconnect', socket =>{
          self.log('\n\n\n\n Disconnect\n', socket, '\n', m['io'])
        })
        //m.sendM'40' + r.apiPath + '/user/' + self.user_id + '?ns=/v1/user/' + self.user_id +'&accessToken=' + encodeURIComponent(_access_token))
    } catch (e) {
        self.log('websocket ',e);
    }
  }
  
  ssEvent(){
    var self = this;
    self.log(e);
  }

  ssHiddenEvent(){
    var self = this;
    self.log(e);
  }
  async login_via_credentials(password){
  //Create an API object from a email address and password.
    var self = this;
    await self._authenticate({
           'grant_type': 'password',
           'username': _email,
           'password': password,
           'device_id' : self.getDeviceId()
    });
    await self._get_user_ID();
    await self.get_system();
    await self.get_Sensors();
    //self.websocket();
    return;
  };//end of function login_via_credentials

  async login_via_token(refresh_token){
    //Create an API object from a refresh token.
    var self = this;
    await self._refresh_access_token(refresh_token);
    await self._get_user_ID();
    await self.get_system();
    await self.get_Sensors();
    //self.websocket();
    return;
  };//end of function login_via_token

  async _authenticate(payload_data){
    //Request token data...
    var self = this;
    var resp = await self.request({
      method:'POST',
      endpoint:'api/token',
      data: payload_data,
      auth: "Basic: " + Buffer.from(self.getClientId() + ':').toString('base64')
    });

    _access_token = resp.access_token;
    _access_token_expire = Date.now() + ((resp.expires_in-60)*1000);
    _access_token_type = resp.token_type;
    this._refresh_token = resp.refresh_token;
  };//End of function _authenticate

  async _get_user_ID (){
    var self = this;
    var resp = await self.request({method:'GET',endpoint: 'api/authCheck'})
    this.user_id = resp['userId'];
  };//End of function _getUserId

  async _refresh_access_token(refresh_token){
    //Regenerate an access token.
    var self = this;
    await self._authenticate({
        'grant_type': 'refresh_token',
        'username': _email,
        'refresh_token': refresh_token
    })
    self._actively_refreshing = false;
  };//End of function _refresh_access_token

  async get_system(){
    //Get systems associated to this account.
    var self = this;
    try{
      var resp = await this.get_subscription_data();
      if (resp === 403) throw('Access Forbidden. Please wait an hour and try again.');
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
            self.log(e);
            return false;
    };
  };//End of function get_system

  async get_subscription_data(){
    var self = this;
    //Get the latest location-level data.
    return await this.request({method: 'GET', endpoint: 'users/' + self.user_id + '/subscriptions', params: {'activeOnly': 'true'}});
  };//End of function get_subscription_data

  async get_Sensors(cached = true) {
    var self = this;
    self.refreshing_Sensors = true;
    if (self.sysVersion==3) {
      var parsedBody = await self.request({
        method:'GET',
        endpoint:'ss3/subscriptions/' + self.subId + '/sensors',
        params:{'forceUpdate': (cached==false).toString().toLowerCase()} //false = coming from cache
      })
      //Check for a successful refresh on sensors --- on 409 send old data
      if (!parsedBody.success) return self.sensors;
      for (var sensor_data of parsedBody.sensors) {
          self.sensors[sensor_data['serial']] = sensor_data;
          if (sensor_data.type == self.SensorTypes['ContactSensor']) {
            self.sensors[sensor_data['serial']] = {...sensor_data, 'entryStatus' : sensor_data.status.triggered ? 'open' : 'closed'};
          } else {
            self.sensors[sensor_data['serial']] = sensor_data;
          }
      }
    } else {
      var parsedBody = await self.request({
          method:'GET',
          endpoint: 'subscriptions/' + self.subId + '/settings',
          params:{'settingsType': 'all', 'cached': cached.toString().toLowerCase()} //true = coming from cache
      })
          //Check for a successful refresh on sensors --- on 409 send old data
      if (!parsedBody.success) return self.sensors;
      for (var sensor_data of parsedBody.settings.sensors) {
        if (!sensor_data['serial']) break;
          if (sensor_data.type == self.SensorTypes['ContactSensor']) {
            self.sensors[sensor_data['serial']] = {...sensor_data, 'status' : { triggered : sensor_data.entryStatus=='open' }};
          } else {
            self.sensors[sensor_data['serial']] = sensor_data;
          }
      }
    };
    self.refreshing_Sensors = false;
  };//End of function get_Sensors

  async get_CameraStream(uuid){
    var self = this;
    if (!self.simplisafe) await self.apiconfig();
    if (_access_token_expire && Date.now() >= _access_token_expire && this._actively_refreshing == false){
            this._actively_refreshing = true;
            await this._refresh_access_token(this._refresh_token);
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

  }

  async get_Alarm_State() {
    var self = this;
    return await self.get_system();
  };//End of function get_Alarm_State

  async set_Alarm_State(value) {
  var self = this;
    if (self.sysVersion==3) {
      return await self.request({
       method:'post',
       endpoint:'ss3/subscriptions/' + self.subId + '/state/' + value
      })
   } else {
        return await self.request({
        method:'post',
        endpoint:'subscriptions/' + self.subId + '/state',
        params:{'state': value}
      })
    };
  };//End of function set_Alarm_State

  async request({method='', endpoint='', headers={}, params={}, data={}, json={}, ...kwargs}){
    var self = this;
    if (!self.simplisafe) await self.apiconfig();
    if (_access_token_expire && Date.now() >= _access_token_expire && this._actively_refreshing == false){
            this._actively_refreshing = true;
            await this._refresh_access_token(this._refresh_token);
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
            'Content-Type': 'application/json; charset=utf-8'
    };

    var options = {
      method: method,
      headers: headers
    }
    var resp = await webResponse(url, options, data);
    self.cookie = resp.cookie;
    if (resp.statusCode >= 400) {
      return resp.statusCode;
    } else {
      return resp.body;
    }
  };//End of function Request

};//end of Class API

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
        if (res.headers['content-type'].indexOf('utf-8') > -1) res.setEncoding('utf8');
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
}; //end of function webResponse
