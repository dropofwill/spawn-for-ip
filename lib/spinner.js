var fs = require('fs');
var atomic = require('atomic')()
var path = require('path')
var portchecker = require('portchecker')
var forever = require('forever')
var async = require('async')

var createRouter = exports.createRouter = function(opts) {
  if (!opts) opts = {};
  if (!opts.time) opts.time = 15
  if (!opts.routes) opts.routes = {}
  if (!opts.debug) opts.debug = false
  if (!('output' in opts)) opts.output = false
  if (opts.output === "no" || opts.output === "none" || opts.output == false) delete opts.output

  var startPort = opts.range && opts.range[0] || 7000
  var endPort = opts.range && opts.range[1] || 7099
  var port = startPort
  var timeToIdle = 1000 * opts.time
  var routes = opts.routes
  var debug = opts.debug
  var output = opts.output

  var that = new process.EventEmitter()

  var ports = []

  function nextPort(callback) {
    var next
    while (~ports.indexOf((next = port++))) {}
    if (port > endPort) port = startPort
    portchecker.getFirstAvailable(port, endPort, '0.0.0.0', function(availPort) {
      ports.push(availPort)
      callback(null, availPort)
    })
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
          log('info', app, 'exited')
          ports.splice(ports.indexOf(app.port), 1)
          app.port = 0
          app.lastAccessTime = 0
          app.child = null
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
              ports.splice(ports.indexOf(app.port), 1)
              app.port = 0
              app.lastAccessTime = 0
              app.child = null
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

  function tcpPing(port, host, attempts, backoff, callback) {

    if (attempts <= 0) {
      callback(new Error("No route"))
      return
    }

    portchecker.isOpen(port, host, function(active) {
      if (!active) {

        // wait and try again
        setTimeout(function() {
          tcpPing(port, host, attempts - 1, backoff * 2, callback)
        }, backoff)
        return
      }

      // port is active, horray!
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
          tcpPing(app.port, "localhost", 4, 500, function(err) {
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

    var fns = []
    for (var name in routes) {
      fns.push((function(_name) {
        return function(cb) { killapp(_name, cb) }
      })(name))
    }

    async.parallel(fns, function() {
      callback()
    })
  }

  function killapp(appname, callback) {
    var app = routes[appname];

    if (!app) {
      callback(new Error(appname + ' not found'))
      return
    }

    if (!app.child) {
      callback(new Error(appname + ' is not started'))
      return
    }

    app.child.removeAllListeners('exit')
    app.child.on('exit', function() {
      log('info', app, 'exited')
      delete app.child
      callback()
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

  that.range = [ startPort, endPort ];
  that.idletime = opts.time;
  that.options = opts;

  return that;
}
