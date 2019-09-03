# homebridge-SimpliSafePlatform

This project is a [Homebridge] platform pluging that allows you to monitor and control your SimpliSafe Alarm System with the iOS  Home app (HomeKit) as well as through Siri. This project uses the its own API from several different examples out there... So, with that being said it is an unoffical version of SimpliSafe API and might change in the future without warning. That will cause this to fail unless monitor and the code updated.

To use this, you must have a working Homebridge server running in your network.

## Screenshots
![View from the home app](/screenshots/0C99F13D-FD5D-406A-AE59-4EBD4BDE7FA8.png?raw=true "View from the Home app.")
![Controlling alarm system](/screenshots/452C5BBE-2D92-4F19-A72F-232E3BA4AB5E.png?raw=true "Controlling the alarm system.")
![System Sensors](/screenshots/E185B5D0-747D-4E25-B57A-7792E6E0295B.png?raw=true "Example of system sensors.")
## Notes
- The "night" toggle in the iOS 10 Home App UI sets the alarm state to "home" in SimpliSafe. This is due to SimpliSafe not having a dedicated "night" mode.
- Usage of this plugin requires the extra $10/month online monitoring plan, since that enables the required API endpoints to control the alarm remotely.
- Removed the ability for Cellular Versions of the system. The system has a Voice Prompt that is unable to be turned off.


## Installation
    npm install -g homebridge-SimpliSafePlatform

## Configuration
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
            "platform" : "homebridge-SimpliSafePlatform",
            "name" : "SimpliSafe Client",
            "SerialNumber": "system serial",
            "username" : "email",
            "password" : "password",
            "refresh_timer": "60"
          }
        ]

    }


- The refresh timer is the amount of time in seconds for the system to updates its current status. It will scan for the system and its sensors. Keep the setting around 60 seconds for systems cellular only versions and don't go much lower than 10 seconds for the wifi ones.

- To clear the cache of accessories. Place in reset=true as an example:

## Configuration
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
            "platform" : "homebridge-SimpliSafePlatform",
            "name" : "SimpliSafe Client",
            "SerialNumber": "system serial",
            "username" : "email",
            "password" : "password",
            "refresh_timer": "60",
            "reset": true
          }
        ]

    }


This will only work for one system at one location. So in order to do multiple systems each location would need to run homebridge and this platform plugin.

# Major Credit goes to chowielin, nfarina, tobycth3 and greencoder.
