# homebridge-SimpliSafePlatform

This project is a [Homebridge] platform pluging that allows you to monitor and control your SimpliSafe Alarm System with the iOS  Home app (HomeKit) as well as through Siri. This project uses SimpliSafe API from several different examples out there... So, with that being said it is an unoffical version of SimpliSafe API and might change in the future without warning. That will cause this to fail unless monitor and the code updated.

## Screenshots
![View from the home app](/screenshots/HomeApp.png?raw=true "View from the Home app.")
![Controlling alarm system](/screenshots/Alarm.png?raw=true "Controlling the alarm system.")
![System Sensors](/screenshots/Sensors.png?raw=true "Example of system sensors.")
## Notes
- Usage of this plugin requires the extra $10/month online monitoring plan, since that enables the required API endpoints to control the alarm remotely.
- The NON-WIFI system has a Voice Prompt that is unable to be turned off.
- Do to SimpliSafe CNAME limitations Cameras will not work on ipv6.


## Installation
    npm install -g homebridge-simplisafeplatform

## Configuration Example
    {
        "bridge": {
            "name": "Homebridge",
            "username": "CC:22:3D:E3:CE:30",
            "port": 51826,
            "pin": "031-45-154"
        },

        "accessories": [],
        "platforms": [
          {
            "platform" : "homebridge-simplisafeplatform",
            "name" : "SimpliSafe Client",
            "SerialNumber": "system serial",
            "username" : "email",
            "password" : "password"
          }
        ]

    }


- This will only work for one system at one location. So in order to do multiple systems each location would need to run homebridge and this platform plugin.

# Major Credit goes to chowielin, nfarina, tobycth3, greencoder, nikonratm, muzzymate and murphmr.
