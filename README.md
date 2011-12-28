# nploy

## Installing

Install with `npm install -f -g nploy` until `node-http-proxy` fixes
for `0.6.x`.

## nploy.createRouter(opts) ###

Options:

 * __range__ - Port range [7000..7099]
 * __time__ - Time to idle [15]
 * __debug__ - Output logs
 * __routes__ - Hash of routing pairs (source -> target) [{}]
 * __output__ - Determines how child process output is handled:
   * __false__ - Will not capture child process output
   * __"console"__ - Will pipe child process stdin/stderr to console.info/console.error
   * __"process"__ - Will pipe child process stdin/stderr to process.stdin/process.stderr

Example:

```js
var router = require('nploy').createRouter({ port: 5000, dir: '../test' })

router.setRoutes({
  'foo': 'a/index.js'
, 'goo': 'b/index.js'
})

router.getRoute('foo', function(err, route, child) {
  if (err) throw new Error(err)
  console.log('Use %s:%d to access "foo"', route.host, route.port)
  router.kill('foo', function(err) {
    console.log('"foo" is now dead')
    router.close()
  })
})
```

Returns a object with the following API:

#### Properties ####

 * __range__ - Returns the port range configured in the router
 * __idletime__ - Time in seconds to wait without a call to ```getRoute``` before the process is killed
 * __options__ - Options object

#### setRoute(source, target), setRoutes(map) ####

`target` may be a path to a node.js script or an object with a `script` property (path to the script)
and extra options passed to the [forever](http://github.com/nodejitsu/forever) module when starting
the child process.

Update routes table with source -> script pair(s).

#### getRoute(source, callback) ####

Returns a route to a source. Callback is ```function(err, port, child)``` where ```port``` 
is the same port passed to the app in ```process.env.PORT```.

#### clearRoute(source), clearRoutes([map]) ####

Deletes route(s). If ```map``` is if not provided, all routes will be deleted

#### kill(source, callback) ####

Kills the process associated with ```source```. ```callback``` is ```function(err)```.

#### close() ####

Shuts down the router. Namely, removes the idle timer.


### nploy.listen(opts, callback) ###

Starts listening with an HTTP proxy and proxy requests based on hostname to different apps. 
```callback``` is invoked once listener is active.

Options:

 * ```host```, ```port``` - Address to bind to
 * ```range``` - Range of TCP ports to allocate to child processes
 * ```time``` - Seconds before an idle process is killed
 * ```config``` - Path a configuration file
 * ```dir``` - Directory where to look for apps

Example:

```js
var nploy = require('nploy')
var options = {
  range: [ 7000, 7099 ]
, time: 15
, port: 80
, host: "0.0.0.0"
, config: "./nploy.cfg"
, dir: "."
}

var server = nploy.listen(options, function(err) {
  if (!err) console.log('listening on', server.endpoint);
})
```

`listen` returns an object with the following API.

#### Properties ####

 * __config__ - Path to the configuration file
 * __router__ - The router object (```createRouter```)
 * __endpoint__ - The host:port this listener is bound to
 * __proxy__ - The http-proxy object

#### close() ####

Closes the proxy listener and the backing router.

## Testing

Add __a.localhost__ and __b.localhost__ to ```/etc/hosts```:

```hosts
127.0.0.1 a.localhost
127.0.0.1 b.localhost
```

Run tests:

```bash
npm test
```

## Licence

MIT/X11
