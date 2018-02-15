var request = require("request");
var Service, Characteristic;

var DEFAULT_CACHE_DIRECTORY = "./.node-persist/storage";

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  HomebridgeAPI = homebridge;
  HomebridgeAPI.registerAccessory("homebridge-nelloio", "Nelloio", Nelloio);
}

function Nelloio(log, config) {
    this.cacheDirectory = HomebridgeAPI.user.persistPath();
    this.storage = require('node-persist');
    this.storage.initSync({dir:this.cacheDirectory, forgiveParseErrors: true});
    this.default_state_off = true;
    this._state = !this.default_state_off;


	this._informationService = new Service.AccessoryInformation();
    this._informationService
            .setCharacteristic(Characteristic.Manufacturer, "Nello")
            .setCharacteristic(Characteristic.Model, "Nello smart intercom")
            .setCharacteristic(Characteristic.SerialNumber, "Not available");

    this._switchService = new Service.Switch(this.name);
    this._switchService
            .getCharacteristic(Characteristic.On)
            .on('set', this.setPowerState.bind(this));

    this.log = log;
    this.name = config.name;

    this.nelloUsername = config["username"];
    this.nelloPassword= config["password"];
    this.nelloApiHost = "https://api.nello.io";
    this.nelloSessionId = this._getSessionIdFromStorage();
    this.nelloLocationId = this._getLocationIdFromStorage();

    this.runningRequest = false;
    this.queue = [];
    this.locks = [];

    if(this.nelloUsername == null || this.nelloUsername == "") {
        throw new Error("You will need to enter a valid username for homebridge user.");
    }
    if(this.nelloPassword == null || this.nelloPassword == "") {
        throw new Error("You will need to enter a valid password for homebridge user.");
    }
}

Nelloio.prototype = {
	identify: function (callback) {
        this.log("Identify requested!");
        callback(); // success
    },

    getServices: function () {
        return [this._switchService, this._informationService];
    },

    setPowerState: function(powerOn, callback) {
    	this.log("setPowerState( "+ powerOn +" )");

    	if(powerOn) {
			this.log("Opening front door");
			this.log("Looking for credentials sessionId:'%s' locationId:'%s' userId:'%s'.", this._isSessionIdSet(), this._isLocationIdSet(), this._isUserIdSet())
			if(!this._isSessionIdSet() || !this._isLocationIdSet() || !this._isUserIdSet()) {
				this.log("No session or location id found, will try to login");
				this._nelloLogin();
			} else {
				this.log("Found all necessary credentials, trying to open");
				this._nelloOpen();
			}

			this._setTimeout();

			this._state = true;
			this._switchService.getCharacteristic(Characteristic.On).updateValue(true);
    	} else {
    		this._state = false;
    		this._switchService.getCharacteristic(Characteristic.On).updateValue(false);
    	}
		callback();
    },

    _nelloLogin: function() {
    	this.log("Trying to login");
    	this._sendLoginRequest();
    },
    _nelloOpen: function() {
		this.log("Trying to open");
	    this._sendOpenRequest(this._getLocationIdFromStorage(), this._getUserIdFromStorage(), this._getSessionIdFromStorage());
    },
    _sendLoginRequest: function() {
    	var entryPoint = "/login"
	    this.log("Send login to Nello.io '%s' on '%s'", this.nelloApiHost, entryPoint);
	    this.runningRequest = true;
	    var self = this;

	    var options = {
	        uri: this.nelloApiHost+entryPoint,
	        method: 'POST',
	        json: {
	            "username": this.nelloUsername,
	            "password": this.nelloPassword
	        }
	    };

	    request(options, function (error, response, body) {
	        var statusCode = response && response.statusCode ? response.statusCode: -1;
	        self.log("Request to nello.io '%s' finished with status code '%s' and body '%s'.", self.nelloApiHost, statusCode, body);

	        if (!error && statusCode == 200) {
	            var json = {};
	            if(body !== "") {
	                //json = JSON.parse(body); already parsed
	                json = body;
	            }
	            var authentication = json.authentication;
	            var authenticationResult = json.result.status;

	            if(json.hasOwnProperty('authentication') && json.hasOwnProperty('result')) {
	                if(authentication && json.result.hasOwnProperty('status')) {
	                    // ALL SUCCESSFULL
	                    self.log("json :"+JSON.stringify(response));
	                    var cookieHeader = String(response.headers["set-cookie"]);
	                    self.log("Cookie : "+cookieHeader);

	                    var sessionRegex = "(session=)([^;]*)[; ]{2}";
	                    var result = cookieHeader.match(sessionRegex);
	                    var sessionId = result[2];
	                    var userId = json.user.user_id;
	                    var locationId = json.user.roles[0].location_id;

			    		self.log("sessionId: "+sessionId+" userId: "+userId+" locationId "+locationId);
	                    self.storage.setItemSync(self._getStorageKeySessionId(), sessionId);
	                    self.storage.setItemSync(self._getStorageKeyLocationId(), locationId);
	                    self.storage.setItemSync(self._getStorageKeyUserId(), userId);

	                    self.log("Got SessionId '%s' locationId '%s' userId '%s' and persisted. Next switch should open.", sessionId, locationId, userId);
	                } else {
	                    self.log("Authentication was not successfull. Wrong credentials?");
	                }
	            } else {
	                self.log("Got other json than expected. Maybe nello.io has a problem or changed something important.");
	            }
	        } else {
	            self.log("Request to nello.io was not succesful. Maybe nello.io has a problem or changed something important.");
	        }
	        self.runningRequest = false;
	    });
    },

    _sendOpenRequest: function(locationId, userId, sessionId) {
    	var entryPoint = "/locations/"+locationId+"/users/"+userId+"/open";
	    var self = this;

	    this.log("Send open request to Nello.io '%s' with locationId '%s' and userId '%s'", this.nelloApiHost+entryPoint, locationId, userId);

	    this.runningRequest = true;

	    var options = {
	        uri: this.nelloApiHost+entryPoint,
	        method: 'POST',
	        json: {
	          "type": "swipe"
	        },
	        headers: {
	          "Cookie" : "session="+sessionId
	        }
	    };

	    request(options, function (error, response, body) {
	        var statusCode = response && response.statusCode ? response.statusCode: -1;
	        self.log("Request to nello.io '%s' finished with status code '%s' and body '%s'.", self.nelloApiHost, statusCode, body);

	        if (!error && statusCode == 200) {
	            var json = {};
	            if(body !== "") {
	                //json = JSON.parse(body); already parsed
	                json = body;
	            }
	            var authenticationResult = json.result.status;

	            if(json.hasOwnProperty('result')) {
	                if(json.result.hasOwnProperty('status')) {
	                    self.log("Opened door successfully");
	                } else {
	                    self.log("Request has different format. Did not find status property.");
	                }
	            } else {
	                self.log("Request has different format. Did not find result property.");
	            }
	        } else {
	            self.log("Request was done but was not successfull. Code="+statusCode);
	        }
	        self.runningRequest = false;
	    });
    },

    _getStorageKeySessionId: function() {
    	return 'sessionId';
    },
    _getStorageKeyLocationId: function() {
    	return 'locationId';
    },
    _getStorageKeyUserId: function() {
    	return 'userId';
    },
    _getSessionIdFromStorage: function() {
		var sessionId = this.storage.getItemSync(this._getStorageKeySessionId());

	    if(sessionId == null) {
	        sessionId = "";
	    }

	    return sessionId;
    },
    _getLocationIdFromStorage: function() {
	    var locationId = this.storage.getItemSync(this._getStorageKeyLocationId());

	    if(locationId == null) {
	        locationId = "";
	    }

	    return locationId;
    },
    _getUserIdFromStorage: function() {
	    var userId = this.storage.getItemSync(this._getStorageKeyUserId());

	    if(userId == null) {
	        userId = "";
	    }

	    return userId;
    },
    _isSessionIdSet: function() {
		return isset(this._getSessionIdFromStorage());
    },
    _isLocationIdSet: function() {
		return isset(this._getLocationIdFromStorage());
    },
    _isUserIdSet: function() {
    	return isset(this._getUserIdFromStorage());
    }
};

Nelloio.prototype._setTimeout = function() {
	setTimeout(function() {
		this._switchService.setCharacteristic(Characteristic.On, false);
	}.bind(this), 1000);
}

function isset(variable) {
    return typeof(variable) != "undefined" && variable !== null && variable != "" && variable != "undefined"
}
