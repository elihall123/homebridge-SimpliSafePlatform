var websession = require('https');
var vm = require('vm');

var io = require("socket.io-client");

var ffmpeg = require("@ffmpeg-installer/ffmpeg")
var dns = require("dns").promises;
var crypto = require("crypto");
var spawn = require('child_process').spawn;

var _access_token;
var _access_token_expire;
var _access_token_type;
var _email;
var APICFGS;
var LocalIP;

class API {
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
      nest: 11,
      camera: 12,
      siren: 13,
      doorLock: 16
    };

    self.ssSystemStates= {
      unknown: "unknown",
      off: "off",
      home: "home",
      away: "away",
      alarm: "alarm",
      home_count: "home_count",
      away_count: "away_count",
      alarm_count: "alarm_count"
    };

    self.ssEventContactIds= {
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
    

  };//End Of Function Constructor

  async get_CameraSettings(serial){
    var self = this;

    let system = await self.get_System()
    return system.cameras.filter(camera => camera.uuid === serial)[0].cameraSettings;
  };//End Of Function get_CameraSettings

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
      if (!APICFGS) APICFGS = await ssAPICFGS();
      APICFGS(self);
  
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
              callback('DISCONNECT');
            });

            self.socket.on('disconnect', reason => {
              self.socket = null;  
              if (reason === 'transport close') {
                  callback('DISCONNECT');
                }
                
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

class CameraSource {
  constructor(serial, _fps, UUIDGen, StreamController, ss, log) {
    this.serial = serial;
    this.ss = ss;
    this.serverIpAddress = null;
    this.UUIDGen = UUIDGen;
    this.StreamController = StreamController;
    this.log = log;
    this.services = [];
    this.streamControllers = [];
    this.pendingSessions = {};
    this.ongoingSessions = {};
    this.options = {
      proxy: false,
      srtp: true,
      video: {
        resolutions: [
          [320, 240, _fps], 
          [320, 240, 15], 
          [320, 180, _fps], 
          [320, 180, 15], 
          [480, 360, _fps], 
          [480, 270, _fps], 
          [640, 480, _fps],
          [848, 480, _fps], 
          [640, 360, _fps], 
          [1280, 720, _fps],
          [1920, 1080, _fps]],
        codec: {
          profiles: [0, 1, 2],
          levels: [0, 1, 2]
        }
      },
      audio: {
        codecs: [{
          type: 'OPUS',
          samplerate: 16
        }]
      }
    };
    this.createStreamControllers(2, this.options);
    if (!APICFGS) APICFGS = ssAPICFGS();
    APICFGS(this);

  }

  handleStreamRequest = async (request) => {
    let sessionId = request.sessionID;

    if (sessionId) {
      let sessionIdentifier = this.UUIDGen.unparse(sessionId);
      
      if (request.type == 'start') {
        let sessionInfo = this.pendingSessions[sessionIdentifier];
        let cameraSettings = await this.ss.get_CameraSettings(this.serial);

        if (sessionInfo) {
          let width, height, fps, videoBitrate, audioBitrate, audioSamplerate, streamWidth, streamHeight;

          if (cameraSettings.pictureQuality == '480p'){
            streamWidth = 640;
            streamHeight = 480;
          } else if (cameraSettings.pictureQuality == '720p'){
            streamWidth = 1280;
            streamHeight = 720;
          } else if (cameraSettings.pictureQuality == '1080p'){
            streamWidth = 1920;
            streamHeight = 1080;
          };


          if (request.video) {
            width = request.video.width;
            height = request.video.height;
          } else {
            width = streamWidth;
            height = streamHeight;
          };

          if (request.video.fps) {
            fps = request.video.fps;
          } else {
            fps = cameraSettings.admin.fps;
          };

          if (request.video.max_bit_rate) {
            videoBitrate = request.video.max_bit_rate;
          } else {
            videoBitrate = cameraSettings.admin.bitRate;
          };

          if (request.audio) {
            audioBitrate = request.audio.max_bit_rate;
            audioSamplerate = request.audio.sample_rate;
          } else {
            audioBitrate = 32;
            audioSamplerate = cameraSettings.admin.audioSampleRate / 1000;
          };

          try{         
            let serverIpAddress = await dns.lookup(this.simplisafe.webapp.mediaHost.replace('https://', ''));
            this.serverIpAddress = serverIpAddress.address;
          }catch(err){
            console.error(err);
          };
          
          let sourceArgs = [
            ['-re'],
            ['-headers', `Authorization: ${_access_token_type} ${_access_token}`],
            ['-i', `https://${this.serverIpAddress}${this.simplisafe.webapp.mediaPath}/${this.serial}/flv?y=${streamHeight}`]
          ];
          
          let videoArgs = [
            ['-map', '0:0'],
            ['-vcodec', 'libx264'],
            ['-tune', 'zerolatency'],
            ['-preset', 'superfast'],
            ['-pix_fmt', 'yuv420p'],
            ['-r', fps],
            ['-f', 'rawvideo'],
            ['-vf', `scale=${width}:${height}`],
            ['-b:v', `${videoBitrate}k`],
            ['-bufsize', `${videoBitrate}k`],
            ['-maxrate', `${videoBitrate}k`],
            ['-payload_type', 99],
            ['-ssrc', sessionInfo.video_ssrc],
            ['-f', 'rtp'], ['-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80'],
            ['-srtp_out_params', sessionInfo.video_srtp.toString('base64')],
            [`srtp://${sessionInfo.address}:${sessionInfo.video_port}?rtcpport=${sessionInfo.video_port}&localrtcpport=${sessionInfo.video_port}&pkt_size=1316`]
          ];

          let audioArgs = [
            ['-map', '0:1'],
            ['-acodec', 'libopus'],
            ['-flags', '+global_header'],
            ['-f', 'null'],
            ['-ar', `${audioSamplerate}k`],
            ['-b:a', `${audioBitrate}k`],
            ['-bufsize', `${audioBitrate}k`],
            ['-payload_type', 110],
            ['-ssrc', sessionInfo.audio_ssrc],
            ['-f', 'rtp'],
            ['-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80'],
            ['-srtp_out_params', sessionInfo.audio_srtp.toString('base64')],
            [`srtp://${sessionInfo.address}:${sessionInfo.audio_port}?rtcpport=${sessionInfo.audio_port}&localrtcpport=${sessionInfo.audio_port}&pkt_size=1316`]
          ];   
          
          let source = [].concat(...sourceArgs.map(arg => arg.map(a => {
            if (typeof a == 'string') {
              return a.trim();
            } else {
              return a;
            }
          })));

          let video = [].concat(...videoArgs.map(arg => arg.map(a => {
            if (typeof a == 'string') {
              return a.trim();
            } else {
              return a;
            }
          })));

          let audio = [].concat(...audioArgs.map(arg => arg.map(a => {
            if (typeof a == 'string') {
              return a.trim();
            } else {
              return a;
            }
          })));

          let cmd = spawn(ffmpeg.path, [...source, ...video, ...audio], {env: process.env});

          this.log(`Start streaming video from ${cameraSettings.cameraName}`);
          cmd.stderr.on('data', data => {
            //this.log(data.toString());
          });
          cmd.on('error', err => {
            this.log('An error occurred while making stream request');
            this.log(err);
          });
          cmd.on('close', code => {
            switch (code) {
              case null:
              case 0:
              case 255:
                this.log('Stopped streaming');
                break;

              default:
                this.log(`Error: FFmpeg exited with code ${code}`);
                this.streamControllers.filter(stream => stream.sessionIdentifier === sessionId).map(stream => stream.forceStop());
                break;
            }
          });
          this.ongoingSessions[sessionIdentifier] = cmd;
        }

        delete this.pendingSessions[sessionIdentifier];
      } else if (request.type == 'stop') {
        let cmd = this.ongoingSessions[sessionIdentifier];

        if (cmd) {
          cmd.kill('SIGTERM');
        }

        delete this.ongoingSessions[sessionIdentifier];
      }
    }
  };

  handleCloseConnection(connId) {
    this.streamControllers.forEach(controller => {
      controller.handleCloseConnection(connId);
    });
  }

  handleSnapshotRequest(request, callback) {
    this.log('Snapshot request. Not yet supported');
    callback(new Error('Snapshots not yet supported'));
  }

  async prepareStream(request, callback) {
    let response = {};
    let sessionInfo = {
      address: request.targetAddress
    };
    let sessionID = request.sessionID;

    if (request.video) {
      let ssrcSource = crypto.randomBytes(4);

      ssrcSource[0] = 0;
      let ssrc = ssrcSource.readInt32BE(0, true);
      response.video = {
        port: request.video.port,
        ssrc: ssrc,
        srtp_key: request.video.srtp_key,
        srtp_salt: request.video.srtp_salt
      };
      sessionInfo.video_port = request.video.port;
      sessionInfo.video_srtp = Buffer.concat([request.video.srtp_key, request.video.srtp_salt]);
      sessionInfo.video_ssrc = ssrc;
    }

    if (request.audio) {
      let ssrcSource = crypto.randomBytes(4);

      ssrcSource[0] = 0;
      let ssrc = ssrcSource.readInt32BE(0, true);
      response.audio = {
        port: request.audio.port,
        ssrc: ssrc,
        srtp_key: request.audio.srtp_key,
        srtp_salt: request.audio.srtp_salt
      };
      sessionInfo.audio_port = request.audio.port;
      sessionInfo.audio_srtp = Buffer.concat([request.audio.srtp_key, request.audio.srtp_salt]);
      sessionInfo.audio_ssrc = ssrc;
    }

    response.address = {
      address: LocalIP,
      type: getIPVersion(LocalIP)
    };

    this.pendingSessions[this.UUIDGen.unparse(sessionID)] = sessionInfo;
    callback(response);
  }

  createStreamControllers(maxStreams, options) {
    for (let i = 0; i < maxStreams; i++) {
      let streamController = new this.StreamController(i, options, this);
      this.services.push(streamController.service);
      this.streamControllers.push(streamController);
    }
  }

}//End Of Class CameraSource

function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};// End of Function uuid4

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
    req.once('response', (res) => {
      LocalIP = req.socket.localAddress;
    });
  });
};//End Of Function webResponse

async function ssAPICFGS() {
  var resp = await webResponse(new URL('https://webapp.simplisafe.com/ssAppConfig.js'), {METHOD: 'GET'});
  resp = resp.body.replace('})(window);', 'return g;});')
              .replace('var a=', 'var a=g.')
              .replace(';', '');
  return vm.runInThisContext(resp);
};

function getIPVersion(Address) {
  if (Address.toString().split('.').length == 4) {return 'v4'} else {return 'v6'};

};

module.exports = {
  API,
  CameraSource
}
