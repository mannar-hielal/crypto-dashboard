import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router';

const SITE_URL = 'https://cryptopapertrade.com';

interface SeoHeadProps {
  title: string;
  description: string;
  path?: string;
  noIndex?: boolean;
}

export function SeoHead({ title, description, path, noIndex }: SeoHeadProps) {
  const location = useLocation();
  const currentPath = path || location.pathname;
  const fullTitle = `${title} | cryptopapertrade.com`;
  const url = `${SITE_URL}${currentPath}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={`${SITE_URL}/og-image.svg`} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={`${SITE_URL}/og-image.svg`} />
      <link rel="canonical" href={url} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
    </Helmet>
  );
}
