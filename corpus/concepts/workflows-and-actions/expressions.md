---
title: "Expressions"
intro: "You can evaluate expressions in workflows and actions."
url: "https://docs.github.com/en/actions/concepts/workflows-and-actions/expressions"
source: "https://github.com/github/docs/blob/27965d1687907bf5f365166999eea249ac88c088/content/actions/concepts/workflows-and-actions/expressions.md"
---
## About expressions

You can use expressions to programmatically set environment variables in workflow files and access contexts. An expression can be any combination of literal values, references to a context, or functions. You can combine literals, context references, and functions using operators. For more information about contexts, see [https://docs.github.com/en/actions/reference/workflows-and-actions/contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts).

Expressions are commonly used with the conditional `if` keyword in a workflow file to determine whether a step should run. When an `if` conditional is `true`, the step will run.

You need to use specific syntax to tell GitHub to evaluate an expression rather than treat it as a string.

`${{ <expression> }}`

> [!NOTE]
> The exception to this rule is when you are using expressions in an `if` clause, where, optionally, you can usually omit `${{` and `}}`. For more information about `if` conditionals, see [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idif).

> [!WARNING]
> When creating workflows and actions, you should always consider whether your code might execute untrusted input from possible attackers. Certain contexts should be treated as untrusted input, as an attacker could insert their own malicious content. For more information, see [https://docs.github.com/en/actions/reference/security/secure-use#good-practices-for-mitigating-script-injection-attacks](https://docs.github.com/en/actions/reference/security/secure-use#good-practices-for-mitigating-script-injection-attacks).

### Example setting an environment variable

```yaml
env:
  MY_ENV_VAR: ${{ <expression> }}
```

## Further reading

For technical reference information about expressions you can use in workflows and actions, see [https://docs.github.com/en/actions/reference/workflows-and-actions/expressions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions).
