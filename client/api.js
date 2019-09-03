var websession = require('https');
var fs = require('fs');
var vm = require('vm');
    

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
    this._refresh_token = resp.refresh_token;
  };//End Of Function _authenticate

  async _get_User_ID (){
    var self = this;
    var resp = await self.request({method:'GET',endpoint: 'api/authCheck'})
    this.user_id = resp['userId'];
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
    self.sensors = {};
    self._actively_refreshing = false;
    self.cameras = {};
    self.readied = false;
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

  };//End Of Function Constructor

  async get_Alarm_State() {
    var self = this;
    return await self.get_System();
  };//End Of Function get_Alarm_State

  async get_Camera_Stream(uuid){
    var self = this;
    if (!self.simplisafe) await self.API_Config();
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

  };//End Of Function get_Camera_Stream

  async get_System(){
    //Get systems associated to this account.
    var self = this;
    try{
      var resp = await this.request({method: 'GET', endpoint: 'users/' + self.user_id + '/subscriptions', params: {'activeOnly': 'true'}});
      if (resp >= 400) throw('Access Forbidden. Please wait an hour and try again. Error: ' + resp);
      for (var system_data of resp.subscriptions){
        if (system_data.location.system.serial === self.serial) {
          //self.log(system_data.features, system_data.location);
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
    var parsedBody = await self.request({
      method:'GET',
      endpoint:'ss3/subscriptions/' + self.subId + '/sensors',
      params:{'forceUpdate': (cached==false).toString().toLowerCase()} //false = coming from cache
    })
    //Check for a successful refresh on sensors --- on 409 send old data
    if (!parsedBody.success) return self.sensors;
    for (var sensor_data of parsedBody.sensors) {
      self.sensors[sensor_data['serial']] = sensor_data;
    };
    return self.sensors;
  };//End Of Function get_Sensors

  async login_via_credentials(password){
    //Create an API object from a email address and password.
      var self = this;
      await self._Authenticate({'grant_type': 'password', 'username': _email, 'password': password});
      await self._get_User_ID();
      await self.get_System();
      await self.get_Sensors();
      self.readied = true;
      //self.websocket();
      return;
  };//End Of Function login_via_credentials
  
  ssEvent(){
    var self = this;
    self.log(e);
  };//End Of Function ssEvent

  ssHiddenEvent(){
    var self = this;
    self.log(e);
  };//End Of Function ssHiddenEvent
  
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
  };//End Of Function websocket
  
  async request({method='', endpoint='', headers={}, params={}, data={}, json={}, ...kwargs}){
    var self = this;
    if (!self.simplisafe) await self.API_Config();
    var refreshing = await setInterval(()=>{if (!self._actively_refreshing)  clearInterval(refreshing);}, 500);

    if (_access_token_expire && Date.now() >= _access_token_expire && !self._actively_refreshing){
      self._actively_refreshing = true;
      await self._Refresh_Access_Token(this._refresh_token);
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
    if (resp.statusCode >= 400) {
      self._actively_refreshing = true;
      await self._Refresh_Access_Token(this._refresh_token);
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
