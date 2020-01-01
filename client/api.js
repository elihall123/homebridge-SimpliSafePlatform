var crypto = require("crypto");
var access_token, access_token_type, APICFGS;

var shutter_AlarmState = {
  'off' : 'shutteroff',
  'away' : 'shutterAway',
  'home' : 'shutterHome'
};

class API {
  //Class SimpliSafe API
  #email;
  #password;
  #refresh_token;
  #actively_refreshing = false;
  #access_token_expire;

  async _authenticate(payload_data){
    //Request token data...
    var self = this;
    try {
      var resp = await self._Request({method:'POST', endpoint:'api/token', data: payload_data, auth: "Basic: " + Buffer.from(self.uuid + ".2074.0.0.com.simplisafe.mobile" + ':').toString('base64')});
      access_token = resp.access_token;
      access_token_type = resp.token_type;
      self.#access_token_expire = Date.now() + ((resp.expires_in-60) * 1000);
      self.#refresh_token = resp.refresh_token;
    } catch (err) {
      throw(`Authenicate Error: ${err}`);
    };

  };//End Of Function _authenticate

  async _get_UserID (){
    var self = this;
    try{
      let resp = await self._Request({method:'GET', endpoint: 'api/authCheck'});
      self.user_id = resp.userId;
    } catch (err) {
      throw(`get_UserID Error: ${err}`);
    };
    
  };//End Of Function _getUserId

  async _Refresh_Access_Token(token) {
    //Regenerate an access token.
    var self = this;
    self.log("Regenerating Access Token");
    try {
      await self._authenticate({'grant_type': 'refresh_token', 'username': this.#email, 'refresh_token': token,});
    } catch (err) {
      throw(err);
    }
    self.#actively_refreshing = false;
  };//End Of Function _refresh_access_token

  async _Request({method='', endpoint='', headers={}, params={}, data={}, json={}, ...kwargs}){
    var self = this;

    var url = new URL(self.simplisafe.webapp.apiHost + self.simplisafe.webapp.apiPath + '/' + endpoint);

    if (params){
      Object.keys(params).forEach(item=> {
          url.searchParams.append(item.toString(), params[item]);
      });
    };

    if (!kwargs.auth) headers['Authorization'] = access_token_type + ' ' + access_token; else headers['Authorization'] = kwargs.auth;

    headers={
            ...headers,
            'Content-Type': 'application/json; charset=utf-8',
            "User-Agent": "SimpliSafe/2105 CFNetwork/902.2 Darwin/17.7.0"
    };

    var options = {
      method: method,
      headers: headers
    }
    if (self.debug) debug(`Sending HTTP Request url: ${url.href}, options: ${JSON.stringify(options)}, data: ${JSON.stringify(data)}`);

    try {
      if (self.debug) {
        let resp = await webResponse(url, options, data);
        debug(resp);
        return resp;
      } else {
        return await webResponse(url, options, data);
      }
    } catch (err)  {
      if (err.statusCode == 401 && err.statusCode == 403 && !self.#actively_refreshing) {
        try {
          self.#actively_refreshing = true;      
          await self._Refresh_Access_Token(self.#refresh_token);
        } catch (err) {
          await self.login_via_credentials();
          self.#actively_refreshing = false;   
        }; 
        return await webResponse(url, options, data);
      } else if (err.statusCode == 409 && err.statusCode >= 500) {
        var resp;
        let rWait = setInterval(async () => {
          resp = await webResponse(url, options, data);
          if (resp) {
            clearInterval(rWait);
          }
        }, 2000);
        return resp;
      } else {
        self.log(err.statusCode, url.href);
      };
    };
  };//End Of Function Request

  async _uAccessories(cache) {
    var self = this;
    let Accessory, index;
    let system = await self.get_System();
    {
      let uuid = self.UUIDGen.generate(self.DeviceIds[self.DeviceIds.baseStation] + ' ' + system.serial.toLowerCase());
      index = this.Accessories.findIndex((sItem) => sItem.uuid == uuid);
      if (index == -1) {
        this.Accessories.push({
          flags:{
            offline: system.isOffline
          },
          model: Object.keys(self.DeviceIds).find(key => self.DeviceIds[key] === self.DeviceIds.baseStation),
          name: 'SimpliSafe Alarm System',
          serial: system.serial,
          status: {
            triggered: system.isAlarming ? 'ALARM' : system.alarmState,
            temp: system.temperature
          },
          type: self.DeviceIds.baseStation,
          uuid: uuid,
          version: system.version
        });
      } else {
        Accessory = this.Accessories[index];
        Accessory.flags.offline = system.isOffline;
        Accessory.status.triggered = system.isAlarming ? 'ALARM' : system.alarmState;
        Accessory.status.temp = system.temperature;
      };
    };

    for (let camera of system.cameras){
      let uuid = self.UUIDGen.generate(self.DeviceIds[self.DeviceIds.camera] + ' ' + camera.uuid.toLowerCase());
      index = this.Accessories.findIndex((sItem) => sItem.uuid == uuid);
      if (index == -1) {
        this.Accessories.push({
          flags: {
            offline: camera.status=='online'? false : true,
            shutter: system.isAlarming ? 'alarm' : camera.cameraSettings[shutter_AlarmState[system.alarmState.toLowerCase()]]
          },
          model: camera.model,
          name: camera.cameraSettings.cameraName || 'Camera',
          serial: camera.uuid,
          status: {
            fps: camera.cameraSettings.admin.fps
          },
          type: self.DeviceIds.camera,
          uuid: uuid, 
          version: camera.model.toString().replace('SS','')
        });
      } else {
        Accessory = this.Accessories[index];
        Accessory.flags.offline = camera.status=='online'? false : true;
        Accessory.flags.shutter = system.isAlarming ? 'alarm' : camera.cameraSettings[shutter_AlarmState[system.alarmState.toLowerCase()]];
        Accessory.status.fps = camera.cameraSettings.admin.fps;
      };
    };

    for (let sensor of await self.get_Sensors(cache)){
      let uuid = self.UUIDGen.generate(self.DeviceIds[sensor.type] + ' ' + sensor.serial.toLowerCase());
      index = this.Accessories.findIndex((sItem) => sItem.uuid == uuid);
      if (index == -1) {
        this.Accessories.push({
          ...sensor,
          'model': Object.keys(self.DeviceIds).find(key => self.DeviceIds[key] === sensor.type), 
          'uuid': uuid,
          'version': system.version
        });
      } else {
        Accessory = this.Accessories[index];
        Accessory.status.triggered = sensor.status.triggered;
        Accessory.deviceGroupID =sensor.deviceGroupID;
        Accessory.setting.instantTrigger = sensor.setting.instantTrigger;
        Accessory.setting.away2 = sensor.setting.away2;
        Accessory.setting.away = sensor.setting.away;
        Accessory.setting.home2 = sensor.setting.home2;
        Accessory.setting.home = sensor.setting.home;
        Accessory.setting.off = sensor.setting.off;
        Accessory.flags.swingerShutdown = sensor.flags.swingerShutdown;
        Accessory.flags.lowBattery = sensor.flags.lowBattery; 
        Accessory.flags.offline = sensor.flags.offline; 
        if (sensor.status.temperature) Accessory.status.temp = sensor.status.temperature;
      };
    };
  };//End Of Function uAccessories

  constructor(config, log, UUIDGen) {
    //Initialize.
    var self = this;
    if (!log) {self.log = console.log;} else {self.log = log;}
    self.debug = process.env.DEBUG != undefined;
    this.#email = config.username;
    this.#password = config.password;
    self.UUIDGen = UUIDGen;
    self.serial = config.SerialNumber;
    self.user_id;
    self.uuid = uuid4();
    
    self.Accessories = [];
    self.DeviceIds = {
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

    self.SystemStates= {
      unknown: "unknown",
      off: "off",
      home: "home",
      away: "away",
      alarm: "alarm",
      home_count: "home_count",
      away_count: "away_count",
      alarm_count: "alarm_count"
    };

    self.EventContactIds= {
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
      wiFiUpdateFailure: "1360",
      entryunlocked: "9700",
      entrylocked: "9701",
      entrySensorSynced: "9704",
      entrySensorUnsynced: "9705"

    };
    

  };//End Of Function Constructor

  async get_System() {
    //Get systems associated to this account.
    var self = this;
    try{
      if (self.debug) debug("getting system status");
      var resp = await self._Request({method: 'GET', endpoint: 'users/' + self.user_id + '/subscriptions', params: {'activeOnly': 'true'}});
      for (var system_data of resp.subscriptions){
        if (system_data.location.system.serial === self.serial) {
            self.subId = system_data.sid;
            self.MajorVersion = system_data.location.system.version;
            self.connType = system_data.location.system.connType;
            return system_data.location.system;
          }
      };
    } catch (err) {
      throw(err);
    };
  };//End Of Function get_System

  async get_Sensors(cached = true) {
    var self = this;
    var resp=[], respv2, respV3;

    try {
      if (!self.subId) await this.get_System();
      if (self.debug) debug("getting sensor status");
      2 === self.MajorVersion && (respv2 = (await self._Request({method:'GET', endpoint:`subscriptions/${self.subId}/settings`, params:{settingsType: 'sensors', cached: cached == false ? 'false' : 'true' }})).settings.sensors) ||  3 === self.MajorVersion && (respV3 = (await self._Request({method:'GET', endpoint:`ss3/subscriptions/${self.subId}/sensors`, params:{"forceUpdate": cached == false ? 'true' : 'false'}})).sensors);

      if (self.MajorVersion==2) {
        //self.log(respv2)
        respv2.forEach((e) =>{
          if (Object.keys(e).length!==0) {
            let sensor = {};
            var r = self.DeviceIds,
            t = e.type,
            n = e.serial && e.serial.toUpperCase(),
            a = e.name,
            l = e.data || e.sensorData || 0;
            sensor.setting = e.setting + 64 * (e.enotify ? 1 : 0) //move the settings up to higher bitwise not sure why....

            sensor.serial = n, 
            sensor.type = t, 
            t === r.freezeSensor && (sensor.status =  { triggered : 41 === sensor.setting && (127 & l) <= 41 || 32 === sensor.setting && (127 & l) <= 32 /*  static values for alarm trips */ , temperature: (127 & l) }) || (sensor.status =  { triggered : (1 == (3 & l) ? true : false) } ),
            sensor.name = a,
            t === r.entrySensor && (
              sensor.setting = { instantTrigger: e.instant,             
              away2: (16 & e.setting) ? 0 : 1,
              away: (8 & e.setting) ? 0 : 1,
              home2: (4 & e.setting) ? 0 : 1,
              home: (2 & e.setting) ? 0 : 1,
              off: (1 & e.setting) ? 0 : 1
            }
            ) || (sensor.setting = { instantTrigger: e.instant }),
            t !== r.glassbreakSensor && t !== r.coDetector && t !== r.smokeDetector && (sensor.flags = { offline: (255 === l) }) || (sensor.flags = { lowBattery: 1 == (1 & l) ? true : !(2 != (2 & l)), offline: (255 === l) });
            
            resp.push(sensor);
          }
          
        });
        return resp;
      } else return respV3;
        
      
    } catch (err) {
      throw ('Sensors:', err);
    };

  };//End Of Function get_Sensors

  async login_via_credentials(){
    //Create an API object from a email address and password.
      var self = this;
      if (!APICFGS) {
        APICFGS = await ssAPICFGS();
        APICFGS(self);
      }

      try {
        await self._authenticate({'grant_type': 'password', 'username': this.#email, 'password': this.#password});
        await self._get_UserID();
        await self._uAccessories();

      } catch (err) {
        throw(`Login Error: ${err}`);
      };
  };//End Of Function login_via_credentials
  
  async get_SokectEvents(callback) {
    var self = this;
    let connTypeCell = false;
    if (!self.socket) {
        try {
            self.socket = require("socket.io-client")(`${self.simplisafe.webapp.apiHost}${self.simplisafe.webapp.apiPath}/user/${self.user_id}`, {
              resource: 'socket.io',
              query: "ns=" + `${self.simplisafe.webapp.apiPath}/user/${self.user_id}` + "&accessToken=" + encodeURIComponent(access_token),
              "force new connection": true,
              reconnection: 0,
              transports: ['websocket']
            });

            self.socket.on('connect', async () => {
              var oldOnevent = self.socket.onevent
              self.socket.onevent = function (packet) {
                if (packet.data && packet.data[0] != 'hiddenEvent' && packet.data[0] != 'event' && packet.data[0] != 'cameraEvent' && packet.data[0] != 'confirm-registered') {
                  self.log('New event', {name: packet.data[0], payload: packet.data[1]})
                }
                oldOnevent.apply(self.socket, arguments)
              };
        
            });

            self.socket.on('confirm-registered', async (data) => {
               data[0] == self.user_id ? self.log('Events up and monitoring.') : self.socket.close();
            });

            self.socket.on('disconnect', () => {
              self.log('Events Handler disconnect')
              let sConnect = setInterval(async () => {
                if (self.socket.connected == true) {
                  clearTimeout(sConnect);
                } else {
                  self.socket.io.opts.query = "ns=" + `${self.simplisafe.webapp.apiPath}/user/${self.user_id}` + "&accessToken=" + encodeURIComponent(access_token);
                  self.socket.open();
                }  
              }, 1000);
            });

            self.socket.on('error', async (data) =>{
              if (data == 'Not authorized') {
                try{
                await self._Refresh_Access_Token(self.#refresh_token);
                } catch (err) {
                  await self.login_via_credentials();
                };
              } else {
                self.log('Event Handling Errored', data);
              };
              self.socket.close();
            });

            self.socket.on('hiddenEvent', async (data) => {
              if (data.sid == self.subId) callback('hiddenEvent', data);
            });

            self.socket.on('event', async (data) => {  
              if (data.sid == self.subId) callback('systemEvent', data);
            });

            self.socket.on('cameraEvent', async (data) => {
              if (data.sid == self.subId) callback('cameraEvent', data);
            });

            self.socket.on("pong", async ()=>{
              try {
                if (self.connType.toLowerCase() == 'cell' && connTypeCell) { 
                  connTypeCell = false;

                } else {
                  connTypeCell = true;
                };  

                await self._uAccessories(connTypeCell);
              } catch (err){
                await self.login_via_credentials();
                await self._uAccessories(connTypeCell);
              };
          });

        } catch (err) {
            throw err;
        }
    }
  };//End of Function get_SokectEvents

  async set_Alarm_State(value) {
    var self = this;
    
    try {
      if (!self.subId) await this.get_System();

      if (self.MajorVersion == 2) {
        return await self._Request({ method:'POST', endpoint:`subscriptions/${self.subId}/state`, params:{"state": value.toLowerCase()} });
      } else {
        return await self._Request({ method:'POST', endpoint: `/ss3/subscriptions/${self.subId}/state/${value}`});
      }

    } catch (err) {
      throw(`Set Alarm State : ${err}`);
    }
    
  };//End Of Function set_Alarm_State

  async set_Lock_State(lockId, State) {
    var self = this;
    try {
      if (!self.subId) {
        await this.get_System();
      }
      return await self._Request({method: 'POST', endpoint: `/doorlock/${self.subId}/${lockId}/state`, data: {"state": State.toLowerCase()}});
    } catch (err) {
      throw(`Set Lock State : ${err}`);
    }


  };//End of set_Alarm_State


};//End Of Class API

class CameraSource {
  constructor(ssCamera, UUIDGen, StreamController, log) {
    this.ssCamera = ssCamera;
    this.debug = process.env.DEBUG != undefined;
    let fps = ssCamera.status.fps;
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
          [320, 240, fps], 
          [320, 240, 15], 
          [320, 180, fps], 
          [320, 180, 15], 
          [480, 360, fps], 
          [480, 270, fps], 
          [640, 480, fps],
          [848, 480, fps], 
          [640, 360, fps], 
          [1280, 720, fps],
          [1920, 1080, fps]],
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

  }// End Of Constructor

  async handleStreamRequest(request) {
    let sessionId = request.sessionID;

    if (sessionId) {
      let sessionIdentifier = this.UUIDGen.unparse(sessionId);
      
      if (request.type == 'start') {
        let sessionInfo = this.pendingSessions[sessionIdentifier];

        if (sessionInfo) {

          let sourceArgs = [
            ['-re'],
            ['-headers', `Authorization: ${access_token_type} ${access_token}`],
            ['-i', `${this.simplisafe.webapp.mediaHost}${this.simplisafe.webapp.mediaPath}/${this.ssCamera.serial}/flv`]
          ];

          let videoArgs = [
            ['-map', '0:0'],
            ['-vcodec', 'libx264'],
            ['-tune', 'zerolatency'],
            ['-preset', 'superfast'],
            ['-pix_fmt', 'yuv420p'],
            ['-r', request.video.fps],
            ['-f', 'rawvideo'],
            ['-vf', `scale=${request.video.width}:${request.video.height}`],
            ['-b:v', `${request.video.max_bit_rate}k`],
            ['-bufsize', `${request.video.max_bit_rate}k`],
            ['-maxrate', `${request.video.max_bit_rate}k`],
            ['-payload_type', 99],
            ['-ssrc', sessionInfo.video_ssrc],
            ['-f', 'rtp'], ['-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80'],
            ['-srtp_out_params', sessionInfo.video_srtp.toString('base64')],
            [`srtp://${sessionInfo.address}:${sessionInfo.video_port}?rtcpport=${sessionInfo.video_port}&localrtcpport=${await openPort(sessionInfo.video_port + 1)}&pkt_size=1316`]
          ];

          let audioArgs = [
            ['-map', '0:1'],
            ['-acodec', 'libopus'],
            ['-flags', '+global_header'],
            ['-f', 'null'],
            ['-ar', `${request.audio.sample_rate}k`],
            ['-b:a', `${request.audio.max_bit_rate}k`],
            ['-bufsize', `${request.audio.max_bit_rate}k`],
            ['-payload_type', 110],
            ['-ssrc', sessionInfo.audio_ssrc],
            ['-f', 'rtp'],
            ['-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80'],
            ['-srtp_out_params', sessionInfo.audio_srtp.toString('base64')],
            [`srtp://${sessionInfo.address}:${sessionInfo.audio_port}?rtcpport=${sessionInfo.audio_port}&localrtcpport=${await openPort(sessionInfo.audio_port + 1)}&pkt_size=1316`]
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

          let cmd = require('child_process').spawn(require("@ffmpeg-installer/ffmpeg").path, [...source, ...video, ...audio], {env: process.env});

          this.log(`Start streaming video from ${this.ssCamera.name}`);
          cmd.stderr.on('data', data => {
            if (this.debug) debug(data.toString());
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
                this.log(`${this.ssCamera.name} camera stopped streaming`);
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
  };// End of Function

  async handleCloseConnection(connId) {
    this.streamControllers.forEach(controller => {
      controller.handleCloseConnection(connId);
    });
  }; //End of Function handleCloseConnection

  async handleSnapshotRequest(request, callback) {
    if (this.ssCamera.flags.offline) {
      callback(new Error(`${this.ssCamera.name} is offline.`))
    };

    if (this.ssCamera.model == 'SS001') {
      if (this.ssCamera.flags.shutter != 'open' || this.ssCamera.flags.shutter != 'alarm') {
        callback(new Error(`${this.ssCamera.name} privacy shutter is close.`))
      };
    };

    let sourceArgs = [['-re'], ['-headers', `Authorization: ${access_token_type} ${access_token}`], ['-i', `${this.simplisafe.webapp.mediaHost}${this.simplisafe.webapp.mediaPath}/${this.ssCamera.serial}/mjpg?x=${request.width}`], ['-t', 1], ['-s', `${request.width}x${request.height}`], ['-f', 'image2'], ['-vframes', 1], ['-']];
    let source = [].concat(...sourceArgs.map(arg => arg.map(a => typeof a == 'string' ? a.trim() : a)));
    let ffmpegCmd = require('child_process').spawn(require("@ffmpeg-installer/ffmpeg").path, [...source], {env: process.env})
    .on('error', error => {
      callback(error);
    })
    .on('close', () => {
       callback(null, imageBuffer);
    });

    let imageBuffer = Buffer.alloc(0);

    ffmpegCmd.stdout
    .on('data', data => {
      imageBuffer = Buffer.concat([imageBuffer, data]);
    });
  
  };// End of Function handleSnapshotRequest

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
    
    var data = await ipLookUp(this.simplisafe.webapp.mediaHost.replace('https://', ''));
    response.address = {
      address: data.address,
      type: data.family
    };

    this.pendingSessions[this.UUIDGen.unparse(sessionID)] = sessionInfo;
    callback(response);
  };// End of Function prepareStream

  async createStreamControllers(maxStreams, options) {
    for (let i = 0; i < maxStreams; i++) {
      let streamController = new this.StreamController(i, options, this);
      this.services.push(streamController.service);
      this.streamControllers.push(streamController);
    }
  };// End of Function createStreamControllers

}//End Of Class CameraSource

function ipLookUp(hostName) {
  return new Promise((resolve) => {
    const req = require('https').get({host: hostName}, (res) => {
        var local = res.socket.address();
        local["remotoeAddress"] = req.connection.remoteAddress;
        resolve(local);
    });
  });
};//End Of Function ipLookUp

function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};// End of Function uuid4

async function webResponse(url, options, data){
    return new Promise(async (resolve, reject) => {
      try {
        const lib = url.href.startsWith('https') ? require('https') : require('http');
        const req = await lib.request(url.href, options, (res) => {
          if (res.statusCode < 200 || res.statusCode > 299) {
            reject(res);
          }
          var body = [];
          if (res.headers['content-encoding'] && res.headers['content-encoding'].indexOf('gzip') > -1) {
            var zlib = require("zlib");
            var gunzip = zlib.createGunzip();
            res.pipe(gunzip);
            gunzip.on('data', function(data) {
              resolve(data.toString());
            });
          } else {
            res.on('data', (chunk) => body.push(chunk)) ;
            res.on('end', () => {
              if (typeof res.headers['content-type']!=='undefined' && res.headers['content-type'].indexOf('application/json') > -1 && body.join('') != '') {
                if (this.debug) (body.join(''), res.headers);
                resolve(JSON.parse(body.join('')));
              } else {
                resolve(body.join(''))
              }
            });
          };
        })

        req.on('error', (err) => reject(err));
  
        if (data) req.write(JSON.stringify(data));
        req.end();
  
      } catch (err) {
        throw(err);
      };
    
    }).catch((err) => {throw (err);});

};//End Of Function webResponse

async function ssAPICFGS() {
  var resp = await webResponse(new URL('https://webapp.simplisafe.com/ssAppConfig.js'), {METHOD: 'GET'});
  resp = resp.replace('})(window);', 'return g;});')
              .replace('var a=', 'var a=g.')
              .replace(';', '');
  return require('vm').runInThisContext(resp);
};//End Of Function ssAPICFGS

function openPort(startingAt) {

  function getNextAvailablePort (currentPort, cb) {
      const server = require('net').createServer();
      server.listen(currentPort, _ => {
          server.once('close', _ => {
              cb(currentPort)
          })
          server.close()
      })
      server.on('error', _ => {
          getNextAvailablePort(++currentPort, cb)
      })
  }

  return new Promise(resolve => {
      getNextAvailablePort(startingAt, resolve)
  })
};//End of Function openPort

function debug(message){
  console.log('\x1b[36m  SimpliSafe \x1b[37m[client API]', message);
}

module.exports = {
  API,
  CameraSource
}
