module.exports = function(options) {
	options = options || {};
	options.range = options.range || [ 7000, 7999 ];
//	if (!options.mapfile) throw new Error('options.mapfile is required');

	var next = options.range[0];
	var map = {};

	var api = {};

	api.alloc = function(key, cb, logger) {
		logger = logger || console;
		logger.log('Allocating port for', key);

		var port = map[key];
		if (port) {
			logger.log('Port ' + port + ' already allocated');
			return cb(null, port);
		}

		// check if we have an available port for the app
		if (next > options.range[1]) {
			logger.error("no more ports");
			return cb(new Error('unable to allocate port for ' + key + '. No more ports'));
		}

		port = map[key] = next++;
		return cb(null, port);
	};

	api.free = function(port, logger) {
		logger = logger || console;
		logger.log('since this is static allocation, port ' + port + ' will not be deallocated');
		return true;
	};

	return api;
};