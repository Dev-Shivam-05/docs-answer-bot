---
title: "Skipping workflow runs"
intro: "You can skip workflow runs triggered by the `push` and `pull_request` events by including a command in your commit message."
url: "https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs"
source: "https://github.com/github/docs/blob/27965d1687907bf5f365166999eea249ac88c088/content/actions/how-tos/manage-workflow-runs/skip-workflow-runs.md"
---
> [!NOTE]
> If a workflow is skipped due to [path filtering](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore), [branch filtering](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpull_requestpull_request_targetbranchesbranches-ignore) or a commit message (see below), then checks associated with that workflow will remain in a "Pending" state. A pull request that requires those checks to be successful will be blocked from merging.

Workflows that would otherwise be triggered using `on: push` or `on: pull_request` won't be triggered if you add any of the following strings to the commit message in a push, or the HEAD commit of a pull request:

* `[skip ci]`
* `[ci skip]`
* `[no ci]`
* `[skip actions]`
* `[actions skip]`

Alternatively, you can add a `skip-checks` trailer to your commit message. The trailers section should be included at the end of your commit message and be preceded by two empty lines. If you already have other trailers in your commit message, `skip-checks` should be last. You can use either of the following:
* `skip-checks:true`
* `skip-checks: true`

By default, Git automatically removes consecutive newlines. To leave the commit message exactly as you entered it, use the `--cleanup=verbatim` option on your commit. For more information, see [`--cleanup=<mode>`](https://git-scm.com/docs/git-commit#Documentation/git-commit.txt---cleanupltmodegt) in the Git documentation.

You won't be able to merge the pull request if your repository is configured to require specific checks to pass first. To allow the pull request to be merged you can push a new commit to the pull request without the skip instruction in the commit message.

> [!NOTE]
> Skip instructions only apply to the `push` and `pull_request` events. For example, adding `[skip ci]` to a commit message won't stop a workflow that's triggered `on: pull_request_target` from running.

Skip instructions only apply to the workflow run(s) that would be triggered by the commit that contains the skip instructions. You can also disable a workflow from running. For more information, see [https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).
