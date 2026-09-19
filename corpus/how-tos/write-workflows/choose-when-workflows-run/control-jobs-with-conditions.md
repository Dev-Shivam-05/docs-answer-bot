---
title: "Using conditions to control job execution"
intro: "Prevent a job from running unless your conditions are met."
url: "https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions"
source: "https://github.com/github/docs/blob/27965d1687907bf5f365166999eea249ac88c088/content/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions.md"
---
You can use the `jobs.<job_id>.if` conditional to prevent a job from running unless a condition is met. You can use any supported context and expression to create a conditional. For more information on which contexts are supported in this key, see [https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability).

### Example: Only run job for a specific repository

This example uses `if` to control when the `production-deploy` job can run. It will only run if the repository is named `octo-repo-prod` and is within the `octo-org` organization. Otherwise, the job will be marked as _skipped_.

```yaml copy
name: example-workflow
on: [push]
jobs:
  production-deploy:
    if: ${{ github.repository == 'octo-org/octo-repo-prod' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v7
        with:
          node-version: '14'
      - run: npm install -g bats
```

Skipped jobs display the message "This check was skipped."

> [!NOTE]
> A job that is skipped will report its status as "Success". It will not prevent a pull request from merging, even if it is a required check.

To debug why a job was skipped or ran unexpectedly, you can view job condition expression logs. For more information, see [https://docs.github.com/en/actions/how-tos/monitor-workflows/view-job-condition-logs](https://docs.github.com/en/actions/how-tos/monitor-workflows/view-job-condition-logs).
