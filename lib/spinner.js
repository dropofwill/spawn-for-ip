var spawn = require('child_process').spawn;
var fsmjs = require('fsmjs');
var async = require('async');
var portscanner = require('portscanner');
var ctxobj = require('ctxobj');

exports.createSpinner = function() {
	var api = {};

	api.start = function(options, callback) {
		if (!callback) callback = function() {};
		if (!options) throw new Error("first argument should be a options hash or a script path");

		// if options is a string, treat as script
		if (typeof options === "string") options = { script: options };

		// if script is provided, use it as the first argument
		if (options.script) {
			options.name = options.name || options.script;
			if (options.args) options.args.unshift(options.script);
			else options.args = [ options.script ];
			delete options.script;
		}

		// if command is not provided, default to node.js
		if (!options.command) options.command = process.execPath;
		
		// logger can be overriden
		var logger = options.logger || console;
		delete options.logger;
		logger = ctxobj.console(logger).pushctx(options.name);

		// default wait timeout is 5 seconds
		options.timeout = options.timeout || 5;

		// default number of start attempts before staying in 'faulted' is 3
		options.attempts = options.attempts || 3;

		// stop timeout defaults to 30 sec
		options.stopTimeout = options.stopTimeout || 30;

		// make sure we have a name
		if (!options.name) throw new Error('options.name is required');

		// obtain a spinner obj
		var fsm = spinner(options.name);

		// store options & logger
		fsm.options = options;
		fsm.logger = logger;
		fsm.name = options.name;
		
		// sign for success/failure events
		fsm.once('started', function() { return callback(null, fsm.port); });
		fsm.once('error', function() { return callback(new Error("unable to start")); });
		fsm.setMaxListeners(1000);

		// hit it
		fsm.trigger('start');
		return fsm;
	};

	api.stop = function(script, callback) {
		if (!callback) callback = function() {};
		var fsm = spinner(script);

		fsm.once('stopped', function(status) {
			return callback(null, status);
		});

		fsm.once('error', function(e) {
			return callback(e);
		});

		fsm.trigger('stop');
		return fsm;
	};

	api.stopall = function(callback) {
		if (!callback) callback = function() {};
		return async.forEach(
			Object.keys(spinnerByName), 
			function(name, cb) { api.stop(name, cb); }, 
			callback);
	};

	api.list = function() {
		var result = {};
		for (var name in spinnerByName) {
			result[name] = api.get(name);
		}
		return result;
	};

	api.get = function(name) {
		var fsm = spinnerByName[name];
		if (!fsm) return null;

		var desc = fsm.options;

		switch (fsm.state) {
			case 'start':
			case 'wait':
				desc.state = 'starting';
				break;
			
			case 'stop':
				desc.state = 'stopping';
				break;

			case 'restart':
				desc.state = 'restarting';
				break;

			default:
				desc.state = fsm.state;
				break;
		}

		return desc;	
	}

	// -- implementation

	var usedPorts = {}; // handle multiple attempts to bind to the same port
	var spinnerByName = {}; // hash of all the spinners by name

	function spinner(name) {
		var fsm = spinnerByName[name];
		if (fsm) return fsm;

		var spinner = {

			stopped: {
				$enter: function(cb) {
					spinner.qemit('stopped');
					return cb();
				},
					
				start: function(cb) {
					spinner.logger.info('starting', spinner.options.name);
					spinner.state = 'start';
					return cb();
				},

				stop: function(cb) {
					spinner.logger.log('already stopped');
					spinner.trigger('$enter');
					return cb();
				},
			},

			start: {
				$enter: function(cb) {
					
					function _findport(from, to, callback) {
						spinner.logger.info('looking for an available port in the range:', [from, to]);
						return portscanner.findAPortNotInUse(from, to, 'localhost', function(err, port) {
							if (err) {
								spinner.logger.error('unable to find available port for child', err);
								return callback(err);
							}

							if (port in usedPorts) {
								spinner.logger.info('Port ' + port + ' is already used, trying from ' + (port + 1));
								return _findport(port + 1, to, callback);
							}

							usedPorts[port] = true;
							return callback(null, port);
						});
					}

					_findport(7000, 7999, function(err, port) {
						if (err) return spinner.trigger('portNotFound');
						else return spinner.trigger('portAllocated', port);
					});

					return cb();
				},

				portNotFound: function(cb) {
					spinner.logger.error('out of ports... sorry... try again later');
					spinner.state = 'faulted';
					return cb();
				},

				portAllocated: function(cb, port) {
					spinner.logger.info('found port', port);

					// spawn the child process and store state
					spinner.port = port;
					spinner.logger.info('spawn', spinner.options.command, spinner.options.args);
					var env = spinner.options.env || {};
					env.port = env.PORT = spinner.port;
					spinner.child = spawn(spinner.options.command, spinner.options.args, { env: env });
					spinner.child.on('exit', function(code, signal) { return spinner.trigger('term', code, signal); });

					spinner.child.stdout.on('data', function(data) { return spinner.emit('stdout', data); });
					spinner.child.stderr.on('data', function(data) { return spinner.emit('stderr', data); });

					spinner.state = 'wait';

					return cb();
				},
				
				start: function(cb) {
					spinner.logger.info('start already pending');
					return cb();
				},

				term: 'faulted',
			},

			wait: {
				$enter: function(cb) {
					spinner.logger.info('waiting for port ' + spinner.port + ' to be bound');
					spinner.wait.tries = spinner.options.timeout * 2;
					spinner.wait.backoff = 500;

					// will begin scanning
					spinner.trigger('wait');

					return cb();
				},

				wait: function(cb) {
					spinner.logger.info('checking status of port ' + spinner.port, 'tries left:', spinner.wait.tries);

					if (spinner.wait.tries-- === 0) {
						spinner.logger.warn('timeout waiting for port');
						return spinner.trigger('waitTimeout');
					}

					portscanner.checkPortStatus(spinner.port, 'localhost', function(err, status) {
						spinner.logger.info('status is', status);
						if (status === "open") return spinner.trigger("opened");
						else return spinner.waitTimeout = spinner.timeout("wait", spinner.wait.backoff);
					});

					return cb();
				},

				term: function(cb) {
					spinner.logger.error('process terminated while waiting');
					spinner.state = 'faulted';
					return cb();
				},

				waitTimeout: function(cb) {
					spinner.logger.error('timeout waiting for port ' + spinner.port);
					spinner.child.kill();
					spinner.state = 'faulted';
					return cb();
				},

				opened: function(cb) {
					spinner.logger.info('port ' + spinner.port + ' opened successfuly');
					spinner.state = 'started';
					return cb();
				},

				start: function(cb) {
					spinner.logger.info('start already pending');
					return cb();
				},

				stop: function(cb) {
					spinner.logger.info('stop waiting for child to start');
					spinner.state = 'stop';
					cb();
				},
				
				$exit: function(cb) {
					if (spinner.waitTimeout) {
						spinner.logger.info('clearing wait timeout');
						clearTimeout(spinner.waitTimeout);
					}
					return cb();
				},
			},

			faulted: {
				$enter: function(cb) {
					spinner._cleanup();

					spinner.faulted.count = spinner.faulted.count ? spinner.faulted.count + 1 : 1;
					spinner.logger.warn('faulted (' + spinner.faulted.count + '/' + spinner.options.attempts + ')');

					if (spinner.faulted.count > spinner.options.attempts) {
						spinner.logger.error('fault limit reached. staying in "faulted" state');
					}
					else {
						spinner.logger.info('moving to stopped state');
						spinner.state = 'stopped';
					}

					spinner.qemit('error', new Error("unable to start child process"));
					return cb();
				},

				stop: function(cb) {
					spinner.logger.info('moving to stop after faulted');
					spinner.state = 'stopped';
					spinner.faulted.count = 0; // reset fault caount
					return cb();
				},

				start: function(cb) {
					spinner.qemit('error', new Error('start failed to start for ' + spinner.options.attempts + ' times, stop before start'));
					return cb();
				},

				'.*': function(cb, e) {
					spinner.logger.error(e, 'triggered while in start-fault');
					return cb();
				},
			},
			
			started: {
				$enter: function(cb) {
					spinner.qemit('started', spinner.port);
					cb();
				},

				start: function(cb) {
					spinner.logger.info('already started');
					spinner.trigger('$enter');
					return cb();
				},

				stop: function(cb) {
					spinner.logger.info('stopping');
					spinner.state = 'stop'
					return cb();
				},

				term: function(cb) {
					spinner.logger.warn('child terminated unexpectedly, restarting');
					spinner.state = 'restart';
					return cb();
				},
			},

			// helper function that cleans up the spinner in case we killed the process
			_cleanup: function() {
				spinner.child.removeAllListeners();
				spinner.child = null;
				delete usedPorts[spinner.port];
				spinner.port = null;
			},

			stop: {
				$enter: function(cb) {
					spinner.child.kill();
					spinner.stop.timeout = spinner.timeout('stopTimeout', spinner.options.stopTimeout * 1000);
					cb();
				},

				term: function(cb, status) {
					spinner.logger.info('exited with status', status);
					spinner.exitStatus = status;
					spinner.state = 'stopped';
					return cb();
				},

				stopTimeout: function(cb) {
					spinner.logger.info('stop timeout. sending SIGKILL');
					spinner.child.kill('SIGKILL');
					spinner.state = 'stopped';
					return cb();
				},

				$exit: function(cb) {
					spinner.logger.info('cleaning up');
					clearTimeout(spinner.stop.timeout);
					spinner._cleanup();
					return cb();
				},
			},
			
			restart: {
				$enter: function(cb) {
					spinner.logger.info('restarting');
					spinner._cleanup();
					spinner.state = 'start';
					return cb();
				},
			},

			assert: function(cb, err) {
				spinner.logger.error('assertion', err);
				return cb();
			},
		};

		return spinnerByName[name] = fsmjs(spinner);
	}

	return api;	
};