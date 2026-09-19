---
title: "Manually running a workflow"
intro: "When a workflow is configured to run on the `workflow_dispatch` event, you can run the workflow using the Actions tab on GitHub, GitHub CLI, or the REST API."
url: "https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow"
source: "https://github.com/github/docs/blob/27965d1687907bf5f365166999eea249ac88c088/content/actions/how-tos/manage-workflow-runs/manually-run-a-workflow.md"
---
## Configuring a workflow to run manually

To run a workflow manually, the workflow must be configured to run on the `workflow_dispatch` event.

To trigger the `workflow_dispatch` event, your workflow must be in the default branch. For more information about configuring the `workflow_dispatch` event, see [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch).

Write access to the repository is required to perform these steps.

## Running a workflow

1. On GitHub, navigate to the main page of the repository.
1. Under your repository name, click **Actions**.

1. In the left sidebar, click the name of the workflow you want to run.

1. Above the list of workflow runs, click the **Run workflow** button.

   > [!NOTE]
   > To see the **Run workflow** button, your workflow file must use the `workflow_dispatch` event trigger. Only workflow files that use the `workflow_dispatch` event trigger will have the option to run the workflow manually using the **Run workflow** button. For more information about configuring the `workflow_dispatch` event, see [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch).

1. Select the **Branch** dropdown menu and click a branch to run the workflow on.
1. If the workflow requires input, fill in the fields.
1. Click **Run workflow**.

> [!NOTE]
> To learn more about GitHub CLI, see [https://docs.github.com/en/github-cli/github-cli/about-github-cli](https://docs.github.com/en/github-cli/github-cli/about-github-cli).

To run a workflow, use the `workflow run` subcommand. Replace the `workflow` parameter with either the name, ID, or file name of the workflow you want to run. For example, `"Link Checker"`, `1234567`, or `"link-check-test.yml"`. If you don't specify a workflow, GitHub CLI returns an interactive menu for you to choose a workflow.

```shell
gh workflow run WORKFLOW
```

If your workflow accepts inputs, GitHub CLI will prompt you to enter them. Alternatively, you can use `-f` or `-F` to add an input in `key=value` format. Use `-F` to read from a file.

```shell
gh workflow run greet.yml -f name=mona -f greeting=hello -F data=@myfile.txt
```

You can also pass inputs as JSON by using standard input.

```shell
echo '{"name":"mona", "greeting":"hello"}' | gh workflow run greet.yml --json
```

To run a workflow on a branch other than the repository's default branch, use the `--ref` flag.

```shell
gh workflow run WORKFLOW --ref BRANCH
```

To view the progress of the workflow run, use the `run watch` subcommand and select the run from the interactive list.

```shell
gh run watch
```

## Running a workflow using the REST API

When using the REST API, you configure the `inputs` and `ref` as request body parameters. If the inputs are omitted, the default values defined in the workflow file are used.

> [!NOTE]
> You can define up to 25  `inputs` for a `workflow_dispatch` event.

For more information about using the REST API, see [https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).
