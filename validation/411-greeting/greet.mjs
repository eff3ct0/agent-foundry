const recipients = process.argv.slice(2);
if (recipients.length !== 1 || recipients[0].trim() === '') {
  console.error('Usage: node greet.mjs NAME');
  process.exitCode = 2;
} else {
  console.log(`Hello, ${recipients[0].trim()}!`);
}
