# Microsoft Clarity (optional; not active)

No Clarity ID or script is included in the application. The intended installation is one GTM tag; configure the actual project ID inside GTM. NEXT_PUBLIC_CLARITY_ID is intentionally unnecessary. Check existing Clarity auto-installation, GTM tags and Cloudflare injection before adding anything.

Owner steps:

1. Create a project for mysaji.com in Clarity with organization-controlled access. Review recording retention, privacy disclosures and applicable consent requirements before enabling.
2. In project settings use Strict masking (all text masked); never unmask inputs or user-generated content. KnowledgeSearch also marks its whole subtree data-clarity-mask=true. Do not enable identification APIs or attach user/email/account/payment data.
3. Follow Microsoft's GTM installation instructions. Trigger the tag only on mysaji_page_view, once per page, require analytics_storage consent, and allow only / or /knowledge and known guide URLs with no query/fragment. Do not use All Pages or a history trigger.
4. Use Clarity Consent Mode V2: after the existing analytics opt-in, call clarity('consentv2', {analytics_Storage:'granted', ad_Storage:'denied'}) through the supported template/API. If your tag/template cannot apply the consent status before recording starts, leave Clarity disabled. Default storage consent must not be granted by the tag.
5. On withdrawal the app reloads without GTM. Validate the current Clarity API/template's withdrawal and cookie-clearing behavior with a production CMP if required. Do not treat the Google consent update alone as Clarity consent.
6. Verify in an actual recording that all text/inputs are masked and that navigating to authentication or private routes ends the tracked document with no private-page capture. Test programmatic navigation and back/forward as well as links. Do not publish Clarity until these tests pass; it is prepared, not claimed live or verified here.

A loaded recorder can observe SPA history. The app forces document navigation for links leaving approved pages, but future programmatic private transitions need an explicit document boundary review. Clarity remains optional pending that end-to-end validation. Strict masking does not replace URL exclusion and route controls.

Official [consent mode](https://learn.microsoft.com/en-us/clarity/setup-and-installation/consent-mode), [client API](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api), [masking](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-masking).
