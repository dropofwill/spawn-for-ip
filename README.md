# Spinner

Spin up node scripts bound to dynamic ports (forked from [nploy](https://github.com/stagas/nploy))

```bash
$ npm install spinner
```

## createRouter(opts) ###

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
var spinner = require('spinner');
var router = spinner.createRouter({ port: 5000, dir: '../test' });

router.setRoutes({
  'foo': 'a/index.js'
, 'goo': 'b/index.js'
});

router.getRoute('foo', function(err, route, child) {
  if (err) throw new Error(err);
  console.log('Use %s:%d to access "foo"', route.host, route.port);
  router.kill('foo', function(err) {
    console.log('"foo" is now dead');
    router.close();
  });
});
```

The `router` object has the following API.

### Properties ###

 * __range__ - Returns the port range configured in the router
 * __idletime__ - Time in seconds to wait without a call to ```getRoute``` before the process is killed
 * __options__ - Options object

### setRoute(source, target), setRoutes(map) ###

`target` may be a path to a node.js script or an object with a `script` property (path to the script)
and extra options passed to the [forever](http://github.com/nodejitsu/forever) module when starting
the child process.

Update routes table with source -> script pair(s).

### getRoute(source, callback) ###

Returns a route to a source. Callback is ```function(err, port, child)``` where ```port``` 
is the same port passed to the app in ```process.env.PORT```.

### clearRoute(source), clearRoutes([map]) ###

Deletes route(s). If ```map``` is if not provided, all routes will be deleted

### kill(source, callback) ###

Kills the process associated with ```source```. ```callback``` is ```function(err)```.

### close() ###

Shuts down the router. Namely, removes the idle timer.

### getchild(source), getpid(source) ###

Returns the `forever` child of a source or it's PID.

## Testing ##

Run tests:

```bash
npm test
```

## Licence ##

MIT/X11

__Author (nploy)__: George Stagas (@stagas)
__Author (spinner)__: Elad Ben-Israel (@eladb)
