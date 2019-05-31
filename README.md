# homebridge-SimpliSafePlatform

This project is a [Homebridge] platform pluging that allows you to monitor and control your SimpliSafe alarm system with the iOS 10 Home app as well as through Siri. This project uses the its own API from several different examples out there... Major Credit goes to chowielin, nfarina and greencoder. 

To use this, you must have a working Homebridge server running in your network. 

## Screenshots
![View from the home app](/screenshots/0C99F13D-FD5D-406A-AE59-4EBD4BDE7FA8.png?raw=true "View from the Home app.")
![Controlling alarm system](/screenshots/452C5BBE-2D92-4F19-A72F-232E3BA4AB5E.png?raw=true "Controlling the alarm system.")
![System Sensors](/screenshots/E185B5D0-747D-4E25-B57A-7792E6E0295B.png?raw=true "Example of system sensors.")
## Notes
- The "night" toggle in the iOS 10 Home App UI sets the alarm state to "home" in SimpliSafe. This is due to SimpliSafe not having a dedicated "night" mode.
- Usage of this plugin requires the extra $10/month online monitoring plan, since that enables the required API endpoints to control the alarm remotely.

## Installation
    npm install -g git+https://github.com/graanco/homebridge-SimpliSafePlatform.git


## Configuration
	{
		"bridge":
		{
			"name": "Homebridge",
			"username": "CD:22:3D:E3:CE:31",
			"port": 51826,
			"pin": "032-45-155"
		},
		"platforms": [
		{
			"platform" : "homebridge-platform-simplisafe",
			"name" : "SimpliSafe Client",
			"SerialNumber": "system serial",
			"username" : "email",
			"password" : "password",
			"refresh_timer": "30" 
		}
		]
	}


- The refresh timer is the amount of time in seconds for the system to updates its current status. It will scan for the system and its sensors. Keep the setting around 30 seconds for systems cellular only versions and don't go much lower than 10 seconds for the wifi ones.

For more than one system just, add in another platform and change it to match the other system.
