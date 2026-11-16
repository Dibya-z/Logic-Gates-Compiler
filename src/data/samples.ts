export interface SampleProgram {
  id: string;
  name: string;
  description: string;
  category: 'working' | 'broken';
  source: string;
}

export const SAMPLES: SampleProgram[] = [
  {
    id: 'example', name: 'The LogicHDL example', category: 'working',
    description: 'Three inputs, three gates. The reference program from the project brief.',
    source: '// A little logic, made visible.\ninput a, b, c;\noutput out;\n\nout = (a AND b) OR NOT c;',
  },
  {
    id: 'half-adder', name: 'Half adder', category: 'working',
    description: 'Adds two one-bit numbers, producing sum and carry.',
    source: '// 0 + 1 = sum 1, carry 0\ninput a, b;\noutput sum, carry;\n\nsum = a XOR b;\ncarry = a AND b;',
  },
  {
    id: 'full-adder', name: 'Full adder', category: 'working',
    description: 'Adds a, b and a carry-in. A shared partial sum drives two outputs.',
    source: 'input a, b, cin;\noutput sum, cout;\nwire partial;\n\npartial = a XOR b;\nsum = partial XOR cin;\ncout = (a AND b) OR (partial AND cin);',
  },
  {
    id: 'mux-2', name: '2:1 multiplexer', category: 'working',
    description: 'Selects d0 when sel is 0 and d1 when sel is 1.',
    source: 'input d0, d1, sel;\noutput y;\n\ny = (NOT sel AND d0) OR (sel AND d1);',
  },
  {
    id: 'mux-4', name: '4:1 multiplexer', category: 'working',
    description: 'Two select bits route one of four data inputs to y.',
    source: 'input d0, d1, d2, d3, s1, s0;\noutput y;\nwire low, high;\n\nlow = (NOT s0 AND d0) OR (s0 AND d1);\nhigh = (NOT s0 AND d2) OR (s0 AND d3);\ny = (NOT s1 AND low) OR (s1 AND high);',
  },
  {
    id: 'xor-nand', name: 'XOR from NAND gates', category: 'working',
    description: 'Four universal NAND gates implement exclusive OR.',
    source: 'input a, b;\noutput y;\nwire common, left, right;\n\ncommon = a NAND b;\nleft = a NAND common;\nright = b NAND common;\ny = left NAND right;',
  },
  {
    id: 'majority', name: 'Three-input majority', category: 'working',
    description: 'The output is 1 when at least two inputs are 1.',
    source: 'input a, b, c;\noutput majority;\n\nmajority = (a AND b) OR (b AND c) OR (a AND c);',
  },
  {
    id: 'comparator', name: '2-bit comparator', category: 'working',
    description: 'Compares unsigned two-bit words a and b.',
    source: 'input a1, a0, b1, b0;\noutput equal, greater, less;\nwire msb_equal;\n\nmsb_equal = a1 XNOR b1;\nequal = msb_equal AND (a0 XNOR b0);\ngreater = (a1 AND NOT b1) OR (msb_equal AND a0 AND NOT b0);\nless = (b1 AND NOT a1) OR (msb_equal AND b0 AND NOT a0);',
  },
  {
    id: 'parity', name: 'Four-bit parity generator', category: 'working',
    description: 'odd is 1 for an odd number of high input bits.',
    source: 'input a, b, c, d;\noutput odd;\n\nodd = a XOR b XOR c XOR d;',
  },
  {
    id: 'seven-segment', name: '7-segment decoder · segment a', category: 'working',
    description: 'Top segment for decimal digits 0–9; invalid BCD inputs produce 0.',
    source: '// BCD dcba. Segment a lights for 0,2,3,5,6,7,8,9.\ninput d, c, b, a;\noutput segment_a;\n\nsegment_a =\n  (NOT d AND NOT c AND NOT b AND NOT a) OR\n  (NOT d AND NOT c AND b) OR\n  (NOT d AND c AND NOT b AND a) OR\n  (NOT d AND c AND b) OR\n  (d AND NOT c AND NOT b);',
  },
  {
    id: 'sr-cascade', name: 'SR-style feed-forward cascade', category: 'working',
    description: 'Reset-dominant next-state logic; q_in is an external input, so there is no cycle.',
    source: '// Feed-forward next-state logic, not a feedback latch.\ninput s, r, q_in;\noutput q_next;\nwire set_path;\n\nset_path = s OR q_in;\nq_next = set_path AND NOT r;',
  },
  {
    id: 'optimization', name: 'Optimization playground', category: 'working',
    description: 'Watch folding, identities, common expressions and dead gates disappear.',
    source: 'input a, b;\noutput y, z;\nwire shared, repeated, dead;\n\nshared = (a AND 1) AND b;\nrepeated = b AND a;\ndead = a XOR b;\ny = NOT NOT shared OR 0;\nz = repeated AND (1 OR 0);',
  },
  { id: 'broken-illegal', name: 'Illegal characters', category: 'broken', description: 'The scanner recovers after two illegal characters.', source: 'input a;\noutput y;\ny = a @ $;' },
  { id: 'broken-number', name: 'Malformed literals', category: 'broken', description: 'LogicHDL literals are exactly 0 or 1.', source: 'input a;\noutput y;\ny = 2 OR 10 OR 0x1;' },
  { id: 'broken-digit-name', name: 'Identifier begins with a digit', category: 'broken', description: 'Names must start with a letter or underscore.', source: 'input 3abc;\noutput y;\ny = 1;' },
  { id: 'broken-comment', name: 'Unterminated block comment', category: 'broken', description: 'Block comments must end with */.', source: 'input a;\n/* This comment never closes\noutput y;\ny = a;' },
  { id: 'broken-syntax', name: 'Syntax recovery', category: 'broken', description: 'Missing operand and empty parentheses are reported in one run.', source: 'input a, b;\noutput y, z;\ny = a AND ;\nz = ();' },
  { id: 'broken-semicolon', name: 'Missing semicolon', category: 'broken', description: 'A declaration is missing its terminator.', source: 'input a\noutput y;\ny = a;' },
  { id: 'broken-parenthesis', name: 'Unmatched parentheses', category: 'broken', description: 'The inner expression is missing a closing parenthesis.', source: 'input a, b;\noutput y;\ny = (a OR b;' },
  { id: 'broken-extra-paren', name: 'Extra closing parenthesis', category: 'broken', description: 'An expression has an unexpected closing parenthesis.', source: 'input a;\noutput y;\ny = a);' },
  { id: 'broken-operators', name: 'Two operators in a row', category: 'broken', description: 'Binary operators need an operand between them.', source: 'input a, b;\noutput y;\ny = a AND OR b;' },
  { id: 'broken-assign', name: 'Missing assignment sign', category: 'broken', description: 'An assignment requires = between the name and expression.', source: 'input a;\noutput y;\ny a;' },
  { id: 'broken-no-names', name: 'Declaration without names', category: 'broken', description: 'A declaration must introduce at least one name.', source: 'input ;\noutput y;\ny = 1;' },
  { id: 'broken-eof', name: 'Unexpected end of file', category: 'broken', description: 'The expression ends before its right operand.', source: 'input a;\noutput y;\ny = a AND' },
  { id: 'broken-stray', name: 'Stray tokens', category: 'broken', description: 'Top-level syntax accepts declarations and assignments.', source: 'input a;\noutput y;\n(a);\ny = a;' },
  { id: 'broken-undefined', name: 'Undefined signal', category: 'broken', description: 'c has never been declared.', source: 'input a, b;\noutput y;\ny = a AND c;' },
  { id: 'broken-double', name: 'Multiple drivers', category: 'broken', description: 'An output can have only one driver; both locations are reported.', source: 'input a, b;\noutput y;\ny = a;\ny = b;' },
  { id: 'broken-input', name: 'Assignment to an input', category: 'broken', description: 'Inputs are driven from outside the circuit.', source: 'input a;\noutput y;\na = 1;\ny = a;' },
  { id: 'broken-duplicate', name: 'Duplicate declaration', category: 'broken', description: 'A signal cannot be declared twice.', source: 'input a;\nwire a;\noutput y;\ny = a;' },
  { id: 'broken-keyword', name: 'Keyword used as a name', category: 'broken', description: 'Reserved operator and declaration words cannot name signals.', source: 'input AND;\noutput y;\ny = 1;' },
  { id: 'broken-cycle', name: 'Combinational cycle', category: 'broken', description: 'A dependency loop cannot settle as combinational hardware.', source: 'input a;\noutput y;\nwire w1, w2;\nw1 = w2 AND a;\nw2 = NOT w1;\ny = w2;' },
  { id: 'broken-undriven', name: 'Signal never assigned', category: 'broken', description: 'Every declared wire and output needs a driver.', source: 'input a;\noutput y;\nwire missing;\ny = a AND missing;' },
  { id: 'broken-input-limit', name: 'Truth table input limit', category: 'broken', description: 'Thirteen inputs would exceed the 4,096-row limit.', source: 'input a,b,c,d,e,f,g,h,i,j,k,l,m;\noutput y;\ny = a OR b OR c OR d OR e OR f OR g OR h OR i OR j OR k OR l OR m;' },
];
