var portscanner = require('portscanner');

module.exports = function(options) {
	options = options || {};
	options.range = options.range || [ 7000,7999 ];

	var usedPorts = {}; // handle multiple attempts to bind to the same port

	function lockPort(port, app) {
		if (port in usedPorts) return false;
		usedPorts[port] = app;
		return true;
	}

	function releasePort(port) {
		delete usedPorts[port];
	}

	var api = {};

	api.alloc = function(key, cb, logger) {
		logger = logger || console;

		function _findport(from, to, callback) {
			logger.log('looking for an available port in the range:', [from, to]);
			return portscanner.findAPortNotInUse(from, to, 'localhost', function(err, port) {
				if (err) {
					logger.error('unable to find available port for child', err);
					return callback(err);
				}

				if (!lockPort(port, key)) {
					logger.log('Port ' + port + ' is already used, trying from ' + (port + 1));
					return _findport(port + 1, to, callback);
				}

				return callback(null, port);
			});
		}

		return _findport(options.range[0], options.range[1], cb);
	};

	api.free = function(port, logger) {
		logger = logger || console;

		return releasePort(port);
	};
	
	return api;
};