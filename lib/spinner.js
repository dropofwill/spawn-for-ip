var fs = require('fs');;
var atomic = require('atomic')();
var path = require('path');
var portscanner = require('portscanner');
var forever = require('forever');
var async = require('async');


var createRouter = exports.createRouter = function(opts) {
  if (!opts) opts = {};
  if (!opts.time) opts.time = 15;
  if (!opts.routes) opts.routes = {};
  if (!opts.debug) opts.debug = false;
  if (!('output' in opts)) opts.output = false;
  if (opts.output === "no" || opts.output === "none" || opts.output == false) delete opts.output;

  var startPort = opts.range && opts.range[0] || 7000;
  var endPort = opts.range && opts.range[1] || 7099;
  var port = startPort;
  var timeToIdle = 1000 * opts.time;
  var routes = opts.routes;
  var debug = opts.debug;
  var output = opts.output;

  var that = new process.EventEmitter();

  var ports = [];

  function nextPort(callback) {
    var next;
    while (~ports.indexOf((next = port++))) {};
    if (port > endPort) port = startPort;
    portscanner.findAPortNotInUse(port, endPort, 'localhost', callback);
  }

  function cleanup(app, callback) {
    if (!callback) callback = function() {};
    log('info', app, 'cleanup');    
    ports.splice(ports.indexOf(app.port), 1);
    delete app.port;
    delete app.child;
    app.lastAccessTime = 0;
    callback();
  }

  function runChild(app, callback) {
    nextPort(function(err, port) {

      app.port = port

      log('info', app, 'running app')

      path.exists(app.app, function(exists) {
        if (!exists) { // script not exists
          callback(new Error(app.app + ' not found'))
          return
        }

        var options = {
          max: 0
        , silent: output ? false : true
        , forever: false
        , env: { PORT: app.port }
        };

        // override options from route definition
        for (var o in app.options) {
          options[o] = app.options[o];
        }
        
        options.killTree = false; // killTree doesn't work on Windows...

        var child = app.child = new forever.Monitor(app.app, options);

        if (output) {
          child.on('stdout', function (data) {
            if (output === 'console') log('info', app, data.toString())
            else process.stdout.write(data)
          })
 
          child.on('stderr', function (data) {
            if (output === 'console') log('error', app, data.toString())
            else process.stderr.write(data)
          })
        }

        app.lastAccessTime = Date.now()

        child.on('exit', function (err, sig) {
          log('info', app, 'exit');
          cleanup(app);
        })

        child.on('start', function() {
          callback()
        })

        child.start()
      })
    })
  }

  function idler () {
    atomic('idler', function (done) {
      var waitFor = 0
      Object.keys(routes).forEach(function (route) {
        var app = routes[route]
        if (app.child && app.lastAccessTime > 0) {
          var now = Date.now()
          if (now - app.lastAccessTime > timeToIdle) {
            waitFor++
            killapp(app.name, function(err) {
              log('info', app, 'idled')
              if (waitFor) {
                --waitFor || done()
              }
            })
          }
        }
      })
      if (!waitFor) done()
    })
  }

  var idlerTimer = setInterval(idler, 5000)

  function log () {
    if (!debug) return;

    var args = [].slice.call(arguments)
      , level = args.shift()
      , app = args.shift()

    //args[args.length - 1] += ':'
    args.unshift(app.name + '@' + app.port, '--')

    console[level].apply(console, args)
  }

  function tcping(expectedState, port, attempts, backoff, callback) {
    if (attempts <= 0) {
      callback(new Error("No route"))
      return
    }

    portscanner.checkPortStatus(port, 'localhost', function(err, status) {
      //console.log('tcping: ' + port + ' current "' + status + '" expect "' + expectedState + '"');
      
      // wait and try again if we are not in the expected status yet (or if there was an error)
      if (err || expectedState !== status) {
        setTimeout(function() { tcping(expectedState, port, attempts - 1, backoff * 2, callback) }, backoff);
        return;
      }

      // port is open, horray!
      callback()
    })
  }

  function setRoute(appname, target) {
    if (typeof target === "string") {
      target = { script: target };
    }

    var script = path.resolve(target.script);
    delete target.script;

    routes[appname] = {
      name: appname
    , options: target
    , app: script
    , child: null
    , port: null
    , lastAccessTime: 0
    }
  }

  function clearRoutes() {
    routes = {};
  }

  function setRoutes(map) {
    for (var appname in map) {
      setRoute(appname, map[appname])
    }
  }

  function getRoute(appname, callback) {
    if (!(appname in routes)) {
      return callback(new Error(appname + ' not found'));
    }
    var app = routes[appname]
    
    app.lastAccessTime = Date.now()

    if (!app.child) {
      runChild(app, function (err) {
        if (!err && app.child) {
          // wait for port to be opened by app
          tcping('open', app.port, 4, 500, function(err) {
            if (err) {
              callback(err)
              return
            }

            callback(null, app.port, app.child)
          })
        }
        else {
          callback(new Error(appname + ' not found'));
        }
      })
    }
    else {
      callback(null, app.port, app.child)
    }
  }

  function close(callback) {
    if (!callback) callback = function() {};

    clearInterval(idlerTimer);

    var fns = [];
    for (var name in routes) {
      var f = (function(_name) { return function(cb) { killapp(_name, cb); }; })(name);
      fns.push(f);
    }
    
    async.parallel(fns, function() {
      callback(); 
    })
  }

  function killapp(appname, callback) {
    var app = routes[appname];

    if (!app) {
      callback(new Error(appname + ' not found'))
      return
    }

    if (!app.child) {
      callback(); // no child, that's good
      return
    }

    log('info', app, 'stopping');

    app.child.removeAllListeners('exit');
    app.child.on('stop', function() {
      log('info', app, 'stopped');
      cleanup(app, callback);
    })

    app.child.stop()
  }

  function getchild(appname) {
    var app = routes[appname];
    if (!app) throw new Error(appname + ' not found');
    return app.child;
  }

  function getpid(appname) {
    var app = routes[appname];
    if (!app) throw new Error(appname + ' not found');
    if (!app.child) return null;
    return app.child.data && app.child.data.pid;
  }
  
  function spin(appname, target, callback) {
      setRoute(appname, target);
      getRoute(appname, callback);
  }

  //
  // api
  //

  that.setRoute = setRoute;
  that.setRoutes = setRoutes;
  that.getRoute = getRoute;
  that.clearRoutes = clearRoutes;
  that.getchild = getchild;
  that.getpid = getpid;
  that.kill = killapp;
  that.close = close;
  that.nextport = nextPort;
  that.spin = spin;

  that.range = [ startPort, endPort ];
  that.idletime = opts.time;
  that.options = opts;

  return that;
}
