import type { LucideIcon } from 'lucide-react';

import { Card } from '@/components/ui/Card';

/**
 * What a tier-gated page shows when the company's plan does not include it.
 *
 * The nav already hides these links, so this is reached only by a typed or
 * bookmarked URL. Saying why beats rendering a screen of 403s — the server
 * refuses every request under `@RequiresFeature` regardless.
 */
export function FeatureUnavailable({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <Card className="mx-auto max-w-[32rem] p-xxl text-center">
      <Icon className="mx-auto size-8 text-text-tertiary" />
      <h1 className="mt-md text-h3 text-text-primary">{title}</h1>
      <p className="mt-xs text-body-md text-text-secondary">{body}</p>
    </Card>
  );
}

export default FeatureUnavailable;
