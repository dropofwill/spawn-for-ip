// modules
var fs = require('fs')
var cp = require('child_process')
var spawn = cp.spawn
var exec = cp.exec
var os = require('os')
var windows = os.platform() === 'win32' ? true : false
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
  if (!opts.dir) opts.dir ='.'
  if (!('output' in opts)) opts.output = false
  if (opts.output === "no" || opts.output === "none" || opts.output == false) delete opts.output

  var startPort = opts.range && opts.range[0] || 7000
  var endPort = opts.range && opts.range[1] || 7099
  var port = startPort
  var timeToIdle = 1000 * opts.time
  var routes = opts.routes
  var debug = opts.debug
  var dir = opts.dir
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

  function runChild (app, callback) {
    nextPort(function(err, port) {

      app.port = port

      log('info', app, 'running app')

      path.exists(app.app, function(exists) {
        if (!exists) { // script not exists
          callback(new Error(app.app + ' not found'))
          return
        }

        var child = app.child = new forever.Monitor(app.app, {
          max: 0
        , silent: output ? false : true
        , forever: false
        , env: { PORT: app.port }
        })

        if (output) {
          console.log('output will be capured!')
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

  function setRoute(hostname, script) {
    var www = hostname.substr(0, 4) === 'www.'
    if (www) {
      hostname = hostname.substr(4)
    }

    // decide if we need relative or absolute path
    script = path.normalize(script)
    if (path.resolve(script) !== script) {
      script = path.join(dir, script)
    }

    script = path.resolve(script)

    routes[hostname] = {
      name: hostname
    , app: script
    , www: www
    , child: null
    , host: '0.0.0.0'
    , port: null
    , lastAccessTime: 0
    }
  }

  function clearRoutes() {
    routes = {};
  }

  function setRoutes(map) {
    for (var hostname in map) {
      setRoute(hostname, map[hostname])
    }
  }

  function getRoute(hostname, callback) {
    var www = hostname.substr(0, 4) === 'www.'
    if (www) {
      hostname = hostname.substr(4)
    }
    if (!(hostname in routes)) {
      return callback(new Error(hostname + ' not found'));
    }
    var app = routes[hostname]
    if (www && !app.www) {
      return callback(null, { redirect: hostname });
    }
    else if (!www && app.www) {
      return callback(null, { redirect: 'www.' + hostname });
    }
    
    app.lastAccessTime = Date.now()

    if (!app.child) {
      runChild(app, function (err) {
        if (!err && app.child) {
          // wait for the child to start by pinging the TCP port
          tcpPing(app.port, app.host, 4, 500, function(err) {
            if (err) {
              callback(err)
              return
            }

            callback(null, { host: app.host, port: app.port })
          })
        }
        else {
          callback(new Error(hostname + ' not found'));
        }
      })
    }
    else {
      callback(null, { host: app.host, port: app.port })
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

  function killapp(hostname, callback) {
    var app = routes[hostname];

    if (!app) {
      callback(new Error(hostname + ' not found'))
      return
    }

    if (!app.child) {
      callback(new Error(hostname + ' is not started'))
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

  function getchild(hostname) {
    var app = routes[hostname];
    if (!app) throw new Error(hostname + ' not found');
    return app.child;
  }

  //
  // api
  //

  that.setRoute = setRoute
  that.setRoutes = setRoutes
  that.getRoute = getRoute
  that.clearRoutes = clearRoutes
  that.getchild = getchild
  that.kill = killapp
  that.close = close

  that.range = [ startPort, endPort ]
  that.idletime = opts.time
  that.options = opts

  return that
}

exports.start = exports.listen = function(opts, callback) {
  if (!opts) opts = {}
  if (!opts.dir) opts.dir = '.'
  if (!opts.config) opts.config = './nploy.cfg'
  if (!opts.router) opts.router = createRouter(opts)
  if (!opts.host) opts.host = '0.0.0.0'
  if (!opts.port) opts.port = 80
  if (!callback) callback = function() {}

  var httpProxy = require('http-proxy')
  var config = path.join(opts.dir, opts.config)
  var router = opts.router
  
  router.setRoutes((function () {
    var routes = {}
    try {
      var cfg = fs.readFileSync(config, 'utf8')
    } catch (err) {
      if (err) {
        throw new Error('"' + config + '" not found.')
        return process.exit()
      }
    }
    cfg.split(/\r\n|\r|\n/gim).forEach(function (line) {
      if (!line.trim().length) return
      var hostname = line.split(' ')[0]
      var target = line.split(' ')[1]
      routes[hostname] = target;
    })
    return routes
  }()))

  var server = httpProxy.createServer(function (req, res, proxy) {
    var buffer = httpProxy.buffer(req)

    if (!('host' in req.headers)) {
      return notFound(res)
    }
    var hostname = req.headers.host.toLowerCase()
    if (~hostname.indexOf(':')) hostname = hostname.split(':')[0]

    req.headers.ip = req.connection.remoteAddress

    return router.getRoute(hostname, function(err, route) {
      if (err) {
        return notFound(res)
      }

      if (route.redirect) {
        redirect(route.redirect, res)
      }
      else {
        proxy.proxyRequest(req, res, {
          host: route.host
        , port: route.port
        , buffer: buffer
        })
      }
    })
  })

  server.listen(opts.port, opts.host, function(err) {
    callback(err)
  })

  function close() {
    server.close()
    router.close()
  }

  function notFound (res) {
    res.writeHead(404, { 'Content-Type': 'text/html' })
    res.end('<h1>Not Found</h1><p>The URL you requested could not be found</p>')
  }

  function redirect (target, res) {
    res.writeHead(301, {
      'Content-Type': 'text/html'
    , 'Location': 'http://' + target 
    })
    return res.end('Moved <a href="http://' + target + '">here</a>')
  }

  var o = {};
  o.config = config
  o.router = router
  o.proxy = server
  o.endpoint = { host: opts.host, port: opts.port }
  o.close = close
  return o
}
