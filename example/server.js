// Copyright (c) 2013, Benjamin J. Kelly ("Author")
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this
//    list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
// ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

'use strict';

var Service = require('../service');

var localAddress = '10.0.1.6';

var serv = new Service();

serv.start(function() {
  serv.on('added', function(opts) {
    console.log('ADDED: [' + opts.name + '] [' + opts.suffix + '] [' +
                opts.address + ']');
  });

  serv.on('removed', function(opts) {
    console.log('REMOVED: [' + opts.name + '] [' + opts.suffix + ']');
  });

  serv.on('error', function(error) {
    console.log('ERROR: [' + error + ']');
  });

  var name = 'VMWINXP.example.com';
  serv.find({name: name, suffix: 0x00}, function(error, address) {
    console.log('FIND: [' + name + '] resulted in [' + address + ']');
  });

  var name2 = 'FOOBAR.example.com';
  serv.add({
    name: name2,
    suffix: 0x00,
    address: localAddress,
    ttl: 3600,
  }, function(error, success) {
    console.log('ADD: [' + name2 + '] resulted in [' + success + ']');
  });

  var badName = 'THISISTOOLONGFORNETBIOS.example.com'
  serv.find({name: badName, suffix: 0x00}, function(error, address) {
    console.log('FIND: returned error [' + error + ']');
    address === null;   // true
  });
});

