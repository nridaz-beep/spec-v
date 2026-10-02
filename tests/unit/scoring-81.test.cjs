const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const current = fs.readFileSync('specv_form_v6_integrated_57.html', 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

// Evaluate the actual production bank and functions without DOM or network side effects.
function context() {
  const ctx = vm.createContext({});
  const bank = current.match(/const QUESTION_BANK\s*=\s*\{[\s\S]*?\n\};/);
  assert(bank);
  vm.runInContext(bank[0] + ';let questions=[],answers=[];', ctx);
  for (const name of ['shuf', 'avg', 'r1']) {
    vm.runInContext(current.match(new RegExp('function ' + name + '\\([^\\n]+'))[0], ctx);
  }
  vm.runInContext(current.slice(current.indexOf('const MEASUREMENT_VERSION='), current.indexOf('function startDiag(){')), ctx);
  vm.runInContext(current.slice(current.indexOf('function calcScores(){'), current.indexOf('// タイプ判定 + レベル')), ctx);
  vm.runInContext(current.slice(current.indexOf('const LV_NAMES='), current.indexOf('function showResult(')).split('// =============================')[0], ctx);
  return ctx;
}

test('1000 draws cover 81 questions, seven semantic positions and every competency/mode', () => {
  const c = context();
  for (let i = 0; i < 1000; i++) {
    const q = vm.runInContext('selectQuestions()', c);
    assert.equal(q.length, 81);
    assert.equal(new Set(q.map(x => x.text)).size, 81);
    const kish = q.filter(x => x.slotId?.startsWith('kish-'));
    assert.equal(new Set(kish.map(x => x.slotId)).size, 7);
    for (const [sub, count] of Object.entries({'突破性向':1,'慎重性向':2,'順応性向':2,'跳躍性向':1,'FA共通':1})) {
      assert.equal(kish.filter(x => x.sub === sub).length, count);
    }
    const grouped = q.filter(x => x.slotId && !x.slotId.startsWith('kish-'));
    assert.equal(new Set(grouped.map(x => x.slotId)).size, 24);
    assert.equal(grouped.filter(x => x.sub.endsWith('消極')).length, 4);
    for (const axis of ['ai', 'tamashii', 'doku', 'kaihou', 'jiko']) {
      assert.equal(q.filter(x => x.axisKey === axis).length, 10);
    }
  }
});

test('stress direction for all twelve items, averaging, order, ties and missing', () => {
  const c = context();
  vm.runInContext("questions=QUESTION_BANK.suishin_seishitsu.filter(q=>q.sub.endsWith('消極'));answers=questions.map(()=>1)", c);
  const low = plain(vm.runInContext('calcStress()', c));
  vm.runInContext('answers=questions.map(()=>7)', c);
  const high = plain(vm.runInContext('calcStress()', c));
  assert.equal(high.leaders.length, 4);
  for (const k of Object.keys(high.scores)) {
    assert.equal(low.scores[k], 1);
    assert.equal(high.scores[k], 7);
  }
  vm.runInContext('answers=questions.map((q,i)=>i<4?1:i<8?4:7)', c);
  const averaged = plain(vm.runInContext('calcStress()', c));
  for (const value of Object.values(averaged.scores)) assert.equal(value, 4);
  vm.runInContext('questions.reverse();answers.reverse()', c);
  assert.deepEqual(plain(vm.runInContext('calcStress()', c)), averaged);
  vm.runInContext('answers=questions.map(()=>null)', c);
  assert.equal(vm.runInContext('calcStress().leaders.length', c), 0);
  assert.equal(vm.runInContext('calcStress().missing.length', c), 4);
  // Positive-control reversed wording must continue to work independently of propulsion.
  vm.runInContext("questions=[{sub:'牽引モード消極',stressReverse:true,reverse:false}];answers=[1]", c);
  assert.equal(vm.runInContext("calcStress().scores['牽引モード']", c), 7);
  assert.equal(vm.runInContext('calcStress().leaders.length', c), 0);
});

test('missing competency is null, never borrowed; scores reject null', () => {
  const c = context();
  vm.runInContext('questions=[];answers=[]', c);
  assert(vm.runInContext('calcCompi({tamashii:7,ai:7,doku:7}).every(x=>x.score===null)', c));
  assert(vm.runInContext('Object.values(calcKishitsu().raw).every(x=>x===null)', c));
  assert(vm.runInContext('Object.values(calcScores()).every(x=>x===null)', c));
  vm.runInContext('questions=selectQuestions();answers=questions.map(()=>null)', c);
  assert(vm.runInContext('calcCompi({tamashii:7}).every(x=>x.score===null)', c));
});

test('baseline blob golden cases preserve six axes, mode, temperament, type and Lv', () => {
  const c = context();
  // Expected outputs were generated from the documented pre-fix blob. No Git history
  // or private attachment is needed to run this test in a shallow CI checkout.
  for (const item of require('../fixtures/scoring-81-baseline.json').cases) {
    vm.runInContext("questions=Object.entries(QUESTION_BANK).flatMap(([k,v])=>v.map(q=>({...q,axisKey:k.startsWith('suishin')?'suishin':k.split('_')[0]})));answers=questions.map((q,i)=>" + item.pattern + ')', c);
    const actual = vm.runInContext('({scores:calcScores(),mode:calcMode(),kish:calcKishitsu(),lv:calcLv(calcScores()),type:getTypeInfo(calcScores())})', c);
    assert.deepEqual(plain(actual), item.expected);
  }
});
