# netbios-name-service

A 100% javascript implemention of the NetBIOS name service defined in
[RFC1001][] and [RFC1002][].

## Example

    var Service = require('netbios-name-service');

    var localAddress = '10.0.1.6';

    var serv = new Service({bindAddress: localAddress});

    serv.start(function() {
      serv.on('added', function(name, suffix, address) {
        console.log('ADDED: [' + name + '] [' + suffix + '] [' + address + ']');
      });

      serv.on('removed', function(name, suffix) {
        console.log('REMOVED: [' + name + '] [' + suffix + ']');
      });

      serv.on('error', function(error) {
        console.log('ERROR: [' + error + ']');
      });

      var name = 'VMWINXP.example.com';
      serv.find({name: name, suffix: 0x00}, function(address) {
        console.log('FIND: [' + name + '] resulted in [' + address + ']');
      });

      var name2 = 'FOOBAR.example.com';
      serv.add({
        name: name2,
        suffix: 0x00,
        address: localAddress,
        ttl: 3600,
      }, function(success) {
        console.log('ADD: [' + name2 + '] resulted in [' + success + ']');
      });

      // The following will trigger the 'error' event due to the illegal name
      var badName = 'THISISTOOLONGFORNETBIOS.example.com'
      serv.find({name: badName, suffix: 0x00}, function(address) {
        address === null;   // true
      });
    });

## Limitations

This module provides a useful set of functionality from the RFCs, but it is
still a work in progress.

Please be aware of the following limitations:

* The name service currently only operates in broadcast mode allowing you
  to interact with peer nodes on the local network.  The point-to-point,
  mixed, and hybrid modes are not yet implemented.  These would allow the
  service to interact with a name server such as WINS.
* Requesting status from a node with a large number of names will currently
  result in an error.  In these cases the message may not fit within a UDP
  packet.  According to the RFC the packet should be marked as truncated and
  re-requested over TCP.  Neither of these actions are currently implemented.
* The service has only been lightly tested on networks with a few nodes.  In
  particular, many of the name conflict corner cases have not been tested in a
  live environment and may contain hidden issues.  Any help testing the service
  in larger networks is appreciated.
* The API should be considered unstable as it may change in future versions.
  Feedback welcome.

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
  * `name` {String} The NetBIOS name to register for the local node.  This
    name can be a fully qualified domain name, but the first part must be
    15 characters or less.  Longer names will result in failure and an
    `'error'` event being issued.
  * `suffix` {Number} The suffix byte indicating the type of the node.
  * `address` {String | null} The address to use for the local node.  Defaults
    to the `bindAddress` passed in the `new NetbiosNameService()` options or
    the first non-internal, IPv4 address returned by `os.networkInterfaces()`.
  * `group` {Boolean | null} Indicate if the name should registered as part
    of a group.  Defaults to false.
  * `ttl` {Number | null} Specify the time-to-live for this name.  Defaults
    to the `defaultTtl` value passed in the `new NetbiosNameService()` options.
* `callback` {Function | null} Callback issued when the requested name has
  been successfully added as a local node or definitively failed.
  * `success` {Boolean} True if the name was successfuly registered for the
    local node.  False if the name is already in use on the network by a
    conflicting node.

### service.remove(options, callback)

Deregister the given name from the local NetBIOS node.

* `options` {Object}
  * `name` {String} The NetBIOS name to remove that has been registered for
    the local node with a previous call to `add()`.
  * `suffix` {Number} The suffix byte indicating the node type that was
    previously used when registering the name.
* `callback` {Function | null} Callback issued when the requested name has
  been successfully deregistered for the local node.

### service.find(options, callback)

Search for a NetBIOS name with the given name.

* `options` {Object}
  * `name` {String} The NetBIOS name to find.
  * `suffix` {Number} The suffix byte indicating the type of node to find.
* `callback` {Function} Callback issued when the specified name has been
  found or the service has failed the request.
  * `node` {Object} The found NetBIOS node information or null if the search
    failed.
    * `name` {String} The NetBIOS name of the node.
    * `suffix` {Number} The suffix byte indicating the type of the node.
    * `address` {String} The IPv4 address for the node.
    * `group` {Boolean} A flag indicating if the found name is a group or
      unique name.
    * `ttl` {Number} The time-to-live of the node.
    * `type` {String} The mode of the node such as 'broadcast' or 'hybrid'.

### service.on('added', node)

An event emitted when either a local is registered or a remote name is
discovered.

* `node` {Object}
  * `name` {String} The NetBIOS name of the node.
  * `suffix` {Number} The suffix byte indicating the type of the node.
  * `address` {String} The IPv4 address for the node.
  * `group` {Boolean} A flag indicating if the found name is a group or
    unique name.
  * `ttl` {Number} The time-to-live of the node.
  * `type` {String} The mode of the node such as 'broadcast' or 'hybrid'.

### service.on('removed', node)

An event emitted when either a local name is deregistered or remote name is
removed either due to release or cache expiration.

* `node` {Object}
  * `name` {String} The NetBIOS name of the node.
  * `suffix` {Number} The suffix byte indicating the type of the node.
  * `address` {String} The IPv4 address for the node.
  * `group` {Boolean} A flag indicating if the found name is a group or
    unique name.
  * `ttl` {Number} The time-to-live of the node.
  * `type` {String} The mode of the node such as 'broadcast' or 'hybrid'.

[RFC1001]: http://tools.ietf.org/rfc/rfc1001.txt
[RFC1002]: http://tools.ietf.org/rfc/rfc1002.txt
