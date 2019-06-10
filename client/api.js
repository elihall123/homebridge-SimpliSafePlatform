var websession = require('https');
var vm = require('vm');

const DEFAULT_AUTH_USERNAME = '.2074.0.0.com.simplisafe.mobile';
const DEFAULT_USER_AGENT = 'SimpliSafe/2105 CFNetwork/902.2 Darwin/17.7.0';

function BasicAuth(login, password){
  return "Basic " +  Buffer.from(login + ':' + password).toString('base64');
}

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
  constructor(SerialNumber, email) {
    //Initialize.
    var self = this;
    _email = email;
    self.refresh_token_dirty = false;
    self.serial = SerialNumber;
    self.user_id;
    self._refresh_token = '';
    self.sensors = {};
    self._actively_refreshing = false;
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
  };

  async apiconfig() {
    var self = this;
    var resp = await webResponse(new URL('https://webapp.simplisafe.com/ssAppConfig.js'), {METHOD: 'GET'})
    resp = resp.replace('})(window);', 'return g;});')
                .replace('var a=', 'var a=g.')
                .replace(';', '');
    let APICFGS = vm.runInThisContext(resp);
    APICFGS(self);
  }


  async login_via_credentials(password){
  //Create an API object from a email address and password.
    await this._authenticate({
           'grant_type': 'password',
           'username': _email,
           'password': password,
    });
    await this._get_user_ID();
    await this.get_system();
    return;
  };//end of function login_via_credentials

  async login_via_token(refresh_token){
    //Create an API object from a refresh token.
    await this._refresh_access_token(refresh_token);
    await this._get_user_ID();
    await this.get_system();
    return;
  };//end of function login_via_token

  async _authenticate(payload_data){
    //Request token data...
    var token_resp = await this.request({
      method:'POST',
      endpoint:'api/token',
      data: payload_data,
      auth: BasicAuth(uuid4() + DEFAULT_AUTH_USERNAME, '')
    });

    _access_token = token_resp.access_token;
    _access_token_expire = new Date(Date.now() + ((token_resp.expires_in-60) * 1000));
    _access_token_type = token_resp.token_type;
    this._refresh_token = token_resp.refresh_token;
  };//End of function _authenticate

  async _get_user_ID (){
    var auth_check_resp = await this.request({method:'GET',endpoint: 'api/authCheck'})
    this.user_id = auth_check_resp['userId'];
  };//End of function _getUserId

  async _refresh_access_token(refresh_token){
    //Regenerate an access token.
    await this._authenticate({
        'grant_type': 'refresh_token',
        'username': _email,
        'refresh_token': refresh_token
    })
    this._actively_refreshing = false;
  };//End of function _refresh_access_token

  async get_system(){
    //Get systems associated to this account.
    var self = this;
    var subscription_resp = await this.get_subscription_data();
    if (!subscription_resp) throw('Missing Sytem Data');
    for (var system_data of subscription_resp.subscriptions){
      if (system_data.location.system.serial === self.serial) {
          self.subId = system_data.sid;
          self.sysVersion = system_data.location.system.version;
          return system_data.location.system;
      }
    };
  };//End of function get_system

  async get_subscription_data(){
    var self = this;
    //Get the latest location-level data.
    return await this.request({method: 'GET', endpoint: 'users/' + self.user_id + '/subscriptions', params: {'activeOnly': 'true'}});
  };//End of function get_subscription_data

  async get_Sensors(cached = true) {
  var self = this;
    if (self.sysVersion==3) {
      var parsedBody = await self.request({
        method:'GET',
        endpoint:'ss3/subscriptions/' + self.subId + '/sensors',
        params:{'forceUpdate': cached.toString().toLowerCase()}
      })
      //Check for a successful refresh on sensors --- on 409 send old data
      if (!parsedBody.success) return self.sensors;
      for (var sensor_data of parsedBody.sensors) {
          self.sensors[sensor_data['serial']] = sensor_data;
          if (self.sensors[sensor_data['serial']].type == self.SensorTypes['ContactSensor']) {
            self.sensors[sensor_data['serial']] = {...sensor_data, 'entryStatus' : sensor_data.status.triggered ? 'open' : 'closed'};
          } else {
            self.sensors[sensor_data['serial']] = sensor_data;
          }
      }
        return self.sensors;
    } else {
    var parsedBody = await self.request({
        method:'GET',
        endpoint: 'subscriptions/' + self.subId + '/settings',
        params:{'settingsType': 'all', 'cached': cached.toString().toLowerCase()}
      })
      //Check for a successful refresh on sensors --- on 409 send old data
        if (!parsedBody.success) return self.sensors;
        for (var sensor_data of parsedBody.settings.sensors) {
          if (!sensor_data['serial']) break;
            if (self.sensors[sensor_data['serial'].type] == self.SensorTypes['ContactSensor']) {
              self.sensors[sensor_data['serial']] = sensor_data;
            } else {
              self.sensors[sensor_data['serial']] = sensor_data;
            }
        }
    }
  };//End of function get_Sensors

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

    if (_access_token_expire && Date.now() >= _access_token_expire && !this._actively_refreshing){
            this._actively_refreshing = true;
            await this._refresh_access_token(this._refresh_token)
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
            'User-Agent': DEFAULT_USER_AGENT,
    };

    var options = {
      method: method,
      headers: headers
    }
    return webResponse(url, options, data);
  };//End of function Request

};//end of Class API

async function webResponse(url, options, data){
  return new Promise((resolve, reject) => {
    const req = websession.request(url.href, options, (res) => {
      if (res.headers['content-type'].indexOf('utf8') > -1) res.setEncoding('utf8');
      var body='';
      if (res.headers['content-encoding'] && res.headers['content-encoding'].indexOf('gzip') > -1) {
        var zlib = require("zlib");
        var gunzip = zlib.createGunzip();
        res.pipe(gunzip);

        gunzip.on('data', function(data) {
          resolve (data.toString());
        });
      } else {
        res.on('data', (chunk) => { body += chunk;}) ;
        res.on('end', () => {
          if (typeof res.headers['content-type']!=='undefined' && res.headers['content-type'].indexOf('application/json') > -1) {
            resolve(JSON.parse(body));
          } else {
            resolve(body);
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
