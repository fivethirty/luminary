// Test file to trigger ESLint
var foo = 1; // no-var rule should trigger
console.log(foo); // might trigger no-console if configured

const unused = 5; // unused variable

if (foo == 1) {
  // eqeqeq rule
  console.log('test');
}

