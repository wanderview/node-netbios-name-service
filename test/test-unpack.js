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

var unpack = require('../lib/unpack');
var pcapUnpack = require('./helpers/pcap-unpack');

//
// Helper routines
//

// Helper routine to validate the expected number of each type of section
// in the message.
function validateSections(test, msg, qCount, ansCount, authCount, addCount) {
  test.equal(msg.questions.length, qCount, 'question array length');
  test.equal(msg.answerRecords.length, ansCount, 'answer record array length');
  test.equal(msg.authorityRecords.length, authCount, 'auth record array length');
  test.equal(msg.additionalRecords.length, addCount, 'additional record array length');
}

//
// Test routines
//

module.exports.testUnpackQuery = function(test) {
  test.expect(6);
  pcapUnpack('netbios-ns-b-query-winxp.pcap', function(error, mLen, msg) {
    test.equal(error, null, 'unpack got error [' + error + ']');
    test.equal(msg.op, 'query', 'message op is [' + msg.op + '], not [query]');
    validateSections(test, msg, 1, 0, 0, 0);
    test.done();
  });
}

module.exports.testUnpackPositiveResponse = function(test) {
  test.expect(7);
  pcapUnpack('netbios-ns-b-positive-response-winxp.pcap', function(error, mLen, msg) {
    test.equal(error, null, 'unpack got error [' + error + ']');
    test.equal(msg.op, 'query', 'message op is [' + msg.op + '], not [query]');
    test.equal(msg.response, true, 'message should be a response');
    validateSections(test, msg, 0, 1, 0, 0);
    test.done();
  });
}

module.exports.testUnpackRegistration = function(test) {
  test.expect(6);
  pcapUnpack('netbios-ns-b-register-winxp.pcap', function(error, mLen, msg) {
    test.equal(error, null, 'unpack got error [' + error + ']');
    test.equal(msg.op, 'registration',
               'message op is [' + msg.op + '], not [registration]');
    validateSections(test, msg, 1, 0, 0, 1);
    test.done();
  });
}

module.exports.testUnpackRegistrationNegativeResponse = function(test) {
  test.expect(14);
  pcapUnpack('netbios-ns-b-register-negative-response-winxp.pcap',
             function(error, mLen, msg) {
    test.equal(error, null, 'unpack got error [' + error + ']');
    test.equal(msg.op, 'registration',
               'message op is [' + msg.op + '], not [registration]');
    test.ok(msg.response, 'message should be a response');
    test.equal(msg.error, 'active', 'unexpected rcode [' + msg.error + ']');
    test.ok(msg.authoritative, 'message should be authoritative');
    validateSections(test, msg, 0, 1, 0, 0);
    var a = msg.answerRecords[0];
    test.equal(a.nbname.fqdn, 'VMWINXP.example.com', 'bad record name');
    test.equal(a.nbname.suffix, 0x20, 'bad record suffix');
    test.equal(a.type, 'nb', 'should be nb record');
    test.equal(a.nb.entries.length, 1, 'should be 1 nb entry');
    test.equal(a.nb.entries[0].address, '192.168.1.7', 'bad IP');
    test.done();
  });
}

module.exports.testUnpackNbstat = function(test) {
  test.expect(9);
  pcapUnpack('netbios-ns-b-nbstat-winxp.pcap', function(error, mLen, msg) {
    test.equal(error, null, 'unpack got error [' + error + ']');
    test.equal(msg.op, 'query', 'message op is [' + msg.op + '], not [query]');
    validateSections(test, msg, 1, 0, 0, 0);
    test.equal(msg.questions[0].type, 'nbstat', 'bad type');
    test.equal(msg.questions[0].nbname.fqdn, 'XYKON-2', 'bad name');
    test.equal(msg.questions[0].nbname.suffix, 0, 'bad suffix');
    test.done();
  });
}

module.exports.testUnpackNbstatResponse = function(test) {
  test.expect(53);
  pcapUnpack('netbios-ns-b-nbstat-response-winxp.pcap', function(error, mLen, msg) {
    test.equal(error, null, 'unpack got error [' + error + ']');
    test.equal(msg.op, 'query', 'message op is [' + msg.op + '], not [query]');
    validateSections(test, msg, 0, 1, 0, 0);
    var a = msg.answerRecords[0];
    test.equal(a.type, 'nbstat', 'bad type');
    test.equal(a.nbname.fqdn, 'VMWINXP', 'bad name');
    test.equal(a.nbname.suffix, 0x20, 'bad suffix');
    var nodes = a.nbstat.nodes;
    test.equal(nodes.length, 6, 'nodes array length');

    test.equal(nodes[0].nbname.fqdn, 'VMWINXP', 'bad node name');
    test.equal(nodes[0].nbname.suffix, 0, 'bad node suffix');
    test.ok(!nodes[0].group, 'bad node group flag');

    test.equal(nodes[1].nbname.fqdn, 'VMWINXP', 'bad node name');
    test.equal(nodes[1].nbname.suffix, 0x20, 'bad node suffix');
    test.ok(!nodes[1].group, 'bad node group flag');

    test.equal(nodes[2].nbname.fqdn, 'WORKGROUP', 'bad node name');
    test.equal(nodes[2].nbname.suffix, 0, 'bad node suffix');
    test.ok(nodes[2].group, 'bad node group flag');

    test.equal(nodes[3].nbname.fqdn, 'WORKGROUP', 'bad node name');
    test.equal(nodes[3].nbname.suffix, 0x1e, 'bad node suffix');
    test.ok(nodes[3].group, 'bad node group flag');

    test.equal(nodes[4].nbname.fqdn, 'WORKGROUP', 'bad node name');
    test.equal(nodes[4].nbname.suffix, 0x1d, 'bad node suffix');
    test.ok(!nodes[4].group, 'bad node group flag');

    test.equal(nodes[5].nbname.fqdn, '\u0001\u0002__MSBROWSE__\u0002', 'bad node name');
    test.equal(nodes[5].nbname.suffix, 0x1, 'bad node suffix');
    test.ok(nodes[5].group, 'bad node group flag');

    for (var i = 0; i < nodes.length; ++i) {
      test.ok(nodes[i].active, 'bad node active flag');
      test.ok(!nodes[i].conflict, 'bad node conflict flag');
      test.ok(!nodes[i].deregister, 'bad node deregister flag');
      test.ok(!nodes[i].permanent, 'bad node permanent flag');
    }

    test.equal(a.nbstat.unitId, '00:0c:29:0d:06:56', 'bad unit ID');

    test.done();
  });
}
