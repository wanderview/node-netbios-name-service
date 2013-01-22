# netbios-name-service

A 100% javascript implemention of the NetBIOS name service defined in
[RFC1001][] and [RFC1002][].

[![Build Status](https://travis-ci.org/wanderview/node-netbios-name-service.png)](https://travis-ci.org/wanderview/node-netbios-name-service)

## Example

``` javascript
var Service = require('netbios-name-service');
var NBName = require('netbios-name');

var serv = new Service();

serv.start(function() {
  serv.on('added', function(opts) {
    console.log('ADDED: [' + opts.nbname + '] [' +
                opts.address + ']');
  });

  serv.on('removed', function(opts) {
    console.log('REMOVED: [' + opts.nbname + ']');
  });

  serv.on('error', function(error) {
    console.log('ERROR: [' + error + ']');
  });

  var nbname = new NBName({fqdn: 'VMWINXP.example.com'});
  serv.find(nbname, function(error, address) {
    console.log('FIND: [' + nbname + '] resulted in [' + address + ']');
  });

  var nbname2 = new NBName({fqdn: 'FOOBAR.example.com'});
  serv.add({
    nbname: nbname2,
    ttl: 3600,
  }, function(error, success) {
    console.log('ADD: [' + nbname2 + '] resulted in [' + success + ']');
  });

  var badNBName = new NBName({fqdn: 'THISISTOOLONGFORNETBIOS.example.com'});
  serv.find(badNBName, function(error, address) {
    console.log('FIND: returned error [' + error + ']');
    address === null;   // true
  });
});
```

## Common Issues

By default the name service will attempt to by to port 137.  If you do not
run as root or with sudo you will get an error like the following:

```
Error: listen EACCES
    at errnoException (net.js:847:11)
    at Server._listen2 (net.js:972:19)
    at listen (net.js:1018:10)
    at Server.listen (net.js:1067:5)
    at NetbiosNameService._startTcp (/Users/bkelly/Dropbox/devel/node-netbios-name-service/service.js:171:23)
    at NetbiosNameService.start (/Users/bkelly/Dropbox/devel/node-netbios-name-service/service.js:116:8)
    at Object.<anonymous> (/Users/bkelly/Dropbox/devel/node-netbios-name-service/example/server.js:32:6)
    at Module._compile (module.js:454:26)
    at Object.Module._extensions..js (module.js:472:10)
    at Module.load (module.js:356:32)
```


In addition, most desktop operating systems run passive NetBIOS name service
daemons in order to provide network browsing features.  If this is the case
you will receive an error like this:

```
Error: bind EADDRINUSE
    at errnoException (dgram.js:359:11)
    at dgram.js:134:26
    at dns.js:71:18
    at process._tickCallback (node.js:386:13)
```

You will need to disable the default operating system NetBIOS support to avoid
this problem.  On Mac OS X this can be done by running the following command:

``` bash
sudo launchctl unload /System/Library/LaunchDaemons/com.apple.netbiosd.plist
```

On Linux it will vary by distribution, but its probably something along the
lines of:

``` bash
sudo /etc/init.d/samba stop
```

## Limitations

This module provides a useful set of functionality from the RFCs, but it is
still a work in progress.

Please be aware of the following limitations:

* The name service currently only operates in broadcast mode allowing you
  to interact with peer nodes on the local network.  The point-to-point,
  mixed, and hybrid modes are not yet implemented.  These would allow the
  service to interact with a name server such as WINS.
* Group names are supported, but not tested yet.  In particular, it is
  likely that you will only be notified of the first IP found and have no
  way of finding the full list of addresses for nodes.
* Requesting status from a node with a large number of names will currently
  result in an error.  In these cases the message may not fit within a UDP
  packet.  According to the RFC the packet should be marked as truncated and
 re-requested over TCP.  Neither of these actions are currently implemented.
* The service has only been lightly tested on networks with a few nodes.  In
  particular, many of the name conflict corner cases have not been tested in a
  live environment and may contain hidden issues.
* The API should be considered unstable as it may change in future versions.

Feedback, testing help, and pull requests welcome.

## Class: NetbiosNameService

### new NetbiosNameService(options)

Construct a new NetbiosNameService object.  The service will not be able to
send or receive messages until the `start()` method is called.

* `options` {Object}
  * `bindAddress` {String | null} The local IPv4 address to use when creating
    the UDP socket and TCP server.  Defaults to binding to `'0.0.0.0'`.
  * `broadcastAddress` {String | null} The IPv4 address to use when
    broadcasting UDP packets.  Defaults to `'255.255.255.255'`.
  * `defaultTtl` {Number | null} The default time-to-live value to use for
    names registered with the `add()` method.  Defaults to 3600.
  * `tcpDisable` {Boolean | null} Disable TCP operations.  This mainly
    prevents other nodes from contacting the service on TCP.  Defaults to
    false.
  * `tcpPort` {Number | null} Specify the port to use when binding the TCP
    server.  Defaults to 137.
  * `tcpServer` {Object | null} Provide an existing TCP server that has
    already been bound.  The service will not open a new server and therefore
    will ignore the `tcpPort` setting.  Note, the `tcpDisable` option takes
    precendence and will cause this server object to be ignored.  Also,
    when the service `stop()` method is called the server will be closed.
  * `udpPort` {Number | null} Specify the port to use when opening the UDP
    socket.  Defaults to 137.
  * `udpSocket` {Object | null} Provide an existing UDP socket instead of
    creating a new one on `start()`.  If this is provided the `udpPort`
    option will be ignored.  This socket will be closed when the `stop()`
    method is called.

### service.start(callback)

Start the NetbiosNameService by opening the UDP socket and creating the
TCP server.

* `callback` {Function | null} Callback issued when the service has fully
  started.

### service.stop(callback)

Stop the NetbiosNameService by clearing the local name map, the remote
name cache, and stopping the network services.  This will cause `removed`
events to be fired for existing names.

* `callback` {Function | null} Callback issued when the service has fully
  stopped.

### service.add(options, callback)

Register the given name for the local NetBIOS node.

* `options` {Object}
  * `nbname` {Object} The NetBIOS name to register for the local node.  This
    must be an instance of the NetbiosName class defined in the [netbios-name][]
    module.
  * `address` {String | null} The address to use for the local node.  Defaults
    to the `bindAddress` passed in the `new NetbiosNameService()` options or
    the first non-internal, IPv4 address returned by `os.networkInterfaces()`.
  * `group` {Boolean | null} Indicate if the name should registered as part
    of a group.  Defaults to false.
  * `ttl` {Number | null} Specify the time-to-live for this name.  Defaults
    to the `defaultTtl` value passed in the `new NetbiosNameService()` options.
* `callback` {Function | null} Callback issued when the requested name has
  been successfully added as a local node or definitively failed.
  * `error` {Object} The `Error` object associated with any exception
    conditions and `null` if none occurred.  Note, the `add()` call can still
    fail due to a name conflict and set the `success` argument `false` without
    passing an `error`.  The `error` is more for things like malformed packets
    and network errors.
  * `success` {Boolean} True if the name was successfuly registered for the
    local node.  False if the name is already in use on the network by a
    conflicting node.
  * `conflictAddress` {String} The IP address of the NetBIOS node that
    currently owns the specified name. `null` if no conflict is detected.

### service.remove(nbname, callback)

Deregister the given name from the local NetBIOS node.

* `nbname` {Object} The NetBIOS name object to remove that has been registered
  for the local node with a previous call to `add()`.
* `callback` {Function | null} Callback issued when the requested name has
  been successfully deregistered for the local node.
  * `error` {Object} The `Error` object associated with any exceptional
    conditions.

### service.find(nbname, callback)

Search for a NetBIOS name with the given name.

* `nbname` {Object} The NetBIOS name to find.
* `callback` {Function} Callback issued when the specified name has been
  found or the service has failed the request.
  * `error` {Object} The `Error` object associated with any exceptional
    conditions.
  * `node` {Object} The found NetBIOS node information or null if the search
    failed.
    * `nbname` {Object} The NetBIOS name of the node.
    * `address` {String} The IPv4 address for the node.
    * `group` {Boolean} A flag indicating if the found name is a group or
      unique name.
    * `ttl` {Number} The time-to-live of the node.
    * `type` {String} The mode of the node such as 'broadcast' or 'hybrid'.

### service.on('added', node)

An event emitted when either a local is registered or a remote name is
discovered.

* `node` {Object}
  * `nbname` {Object} The NetBIOS name of the node.
  * `address` {String} The IPv4 address for the node.
  * `group` {Boolean} A flag indicating if the found name is a group or
    unique name.
  * `ttl` {Number} The time-to-live of the node.
  * `type` {String} The mode of the node such as 'broadcast' or 'hybrid'.

### service.on('removed', node)

An event emitted when either a local name is deregistered or remote name is
removed either due to release or cache expiration.

* `node` {Object}
  * `nbname` {Object} The NetBIOS name of the node.
  * `address` {String} The IPv4 address for the node.
  * `group` {Boolean} A flag indicating if the found name is a group or
    unique name.
  * `ttl` {Number} The time-to-live of the node.
  * `type` {String} The mode of the node such as 'broadcast' or 'hybrid'.

### service.on('error', error)

An event emitted when unhandled exceptional conditions occur.  Normally
this will only be things like failing to bind network sockets, etc.

* `error` {Object}  The `Error` object

[RFC1001]: http://tools.ietf.org/rfc/rfc1001.txt
[RFC1002]: http://tools.ietf.org/rfc/rfc1002.txt
[netbios-name]: https://github.com/wanderview/node-netbios-name
