import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderLiquid, type Resolver } from '../scripts/liquid.ts';

const resolver: Resolver = {
  async reusable(path) {
    return path === 'actions.note' ? 'Reusable about {% data variables.product.prodname_actions %}.' : null;
  },
  async variable(path) {
    return path === 'product.prodname_actions' ? 'GitHub Actions' : null;
  },
  async feature(name) {
    return name === 'on-fpt';
  },
};

test('renders data references, fpt conditionals and drops other tags', async () => {
  const src = [
    '{% data variables.product.prodname_actions %} {% data reusables.actions.note %}',
    '{% ifversion ghes %}server only{% else %}dotcom{% endif %}',
    '{% ifversion on-fpt %}feature on{% endif %}{% ifversion not fpt %}hidden{% endif %}',
    '{% note %}kept{% endnote %} {% comment %}gone{% endcomment %}',
    '{% raw %}${{ secrets.TOKEN }}{% endraw %}',
  ].join('\n');
  const out = await renderLiquid(src, resolver);
  assert.equal(
    out,
    ['GitHub Actions Reusable about GitHub Actions.', 'dotcom', 'feature on', 'kept ', '${{ secrets.TOKEN }}'].join('\n'),
  );
});
