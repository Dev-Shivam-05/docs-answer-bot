// Asks one question from the command line and prints the JSON answer.
// Usage: npm run ask -- "How do I cancel a workflow run?"
import { ask } from '../src/answer.ts';

const question = process.argv.slice(2).join(' ').trim();
if (!question) {
  console.error('Usage: npm run ask -- "your question"');
  process.exit(2);
}
console.log(JSON.stringify(await ask(question), null, 2));
