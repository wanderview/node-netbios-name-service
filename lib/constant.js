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

module.exports = {
  // See RFC 1002 - page 9
  OPCODE_TO_STRING: {
    0x0: 'query',
    0x5: 'registration',
    0x6: 'release',
    0x7: 'wack',
    0x8: 'refresh'
  },
  OPCODE_FROM_STRING: {
    'query': 0x0,
    'registration': 0x5,
    'release': 0x6,
    'wack': 0x7,
    'refresh': 0x8
  },

  // See RFC 1002 - pages 9-10
  NM_FLAG_B: 1 << 0,
  NM_FLAG_RA: 1 << 3,
  NM_FLAG_RD: 1 << 4,
  NM_FLAG_TC: 1 << 5,
  NM_FLAG_AA: 1 << 6,

  // See RFC 1002 - page 17
  RCODE_TO_STRING: {
    0x0: '',
    0x1: 'format',
    0x2: 'server',
    0x4: 'unsupported',
    0x5: 'refused',
    0x6: 'active',
    0x7: 'conflict'
  },
  RCODE_FROM_STRING: {
    '': 0x0,
    'format': 0x1,
    'server': 0x2,
    'unsupported': 0x4,
    'refused': 0x5,
    'active': 0x6,
    'conflict': 0x7
  },

  // See RFC 1002 - page 10
  QUESTION_TYPE_TO_STRING: {
    0x0020: 'nb',
    0x0021: 'nbstat'
  },
  QUESTION_TYPE_FROM_STRING: {
    'nb': 0x0020,
    'nbstat': 0x0021
  },

  CLASS_IN: 0x0001,

  // See RFC 1002 - pages 11-12
  RR_TYPE_TO_STRING: {
    0x0001: 'a',
    0x0002: 'ns',
    0x000A: 'null',
    0x0020: 'nb',
    0x0021: 'nbstat'
  },
  RR_TYPE_FROM_STRING: {
    'a': 0x0001,
    'ns': 0x0002,
    'null': 0x000A,
    'nb': 0x0020,
    'nbstat': 0x0021
  },

  NB_FLAG_G: 0x8000,
  NB_FLAG_ONT: 0x6000,
  ONT_TO_STRING: {
    0x0: 'broadcast',
    0x1: 'point',
    0x2: 'mixed',
    0x3: 'hybrid'
  },
  ONT_FROM_STRING: {
    'broadcast': 0x0,
    'point': 0x1,
    'mixed': 0x2,
    'hybrid': 0x3
  },

  NAME_FLAG_PRM: 0x0200,
  NAME_FLAG_ACT: 0x0400,
  NAME_FLAG_CNF: 0x0800,
  NAME_FLAG_DRG: 0x1000,
  NAME_FLAG_ONT: 0x6000,
  NAME_FLAG_G: 0x8000,
};
