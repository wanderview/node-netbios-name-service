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
