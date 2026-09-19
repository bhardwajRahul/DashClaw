import Link from 'next/link';
import { ChevronRight, ScrollText } from 'lucide-react';
import PublicNavbar from '../components/PublicNavbar';
import PublicFooter from '../components/PublicFooter';
import type { Metadata } from 'next';
import { marketingPageMetadata } from '../lib/marketingSeo';

export const metadata: Metadata = marketingPageMetadata({
  title: 'Terms of Service: DashClaw',
  description:
    'The terms for the DashClaw hosted trial and the MIT license that covers the self-hosted software.',
  path: '/terms',
});

const LAST_UPDATED = '2026-09-19';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 py-6 border-b border-border last:border-b-0">
      <h2 className="text-lg font-semibold text-text-primary mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-text-secondary leading-relaxed">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface-primary text-text-primary">
      <PublicNavbar />

      <section className="pt-28 pb-8 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-text-tertiary mb-4">
            <Link href="/" className="hover:text-text-primary transition-colors">Home</Link>
            <ChevronRight size={14} />
            <span className="text-text-primary">Terms</span>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-subtle flex items-center justify-center">
              <ScrollText size={20} className="text-brand" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
              <p className="mt-2 text-text-secondary leading-relaxed">
                What you agree to when you use the hosted trial, and what covers the software you run yourself.
              </p>
              <p className="mt-1 text-xs text-text-tertiary font-mono uppercase tracking-wide">
                Last updated {LAST_UPDATED}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="px-6 pb-16">
        <div className="max-w-3xl mx-auto">
          <Section id="scope" title="Two deployment models, two sets of terms">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-text-primary font-medium">Self-hosted (the default).</span>{' '}
                The DashClaw software is open source under the{' '}
                <a
                  href="https://github.com/ucsandman/DashClaw/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline"
                >
                  MIT License
                </a>
                . That license is the whole agreement: you can run, modify, and redistribute it, and it comes
                with no warranty. Nothing on this page adds to or limits it.
              </li>
              <li>
                <span className="text-text-primary font-medium">Hosted trial (dashclaw.io).</span>{' '}
                If you sign in on our hosted instance, or connect an AI agent to it, these terms apply.
              </li>
            </ul>
          </Section>

          <Section id="service" title="The hosted trial">
            <p>
              The hosted trial is a capped, free evaluation instance of DashClaw that we operate. It exists
              so you can see the product work with a real agent before you self-host. It is offered as is,
              without an uptime commitment, and we may change, limit, or end it at any time. Data in a
              trial workspace can be deleted when the trial ends, when the workspace is idle, or when we
              retire the instance.
            </p>
            <p>
              You must be 18 or older, and you are responsible for the workspace you create and for every
              agent, connector, and API key you attach to it.
            </p>
          </Section>

          <Section id="connectors" title="Agents and connectors">
            <p>
              You can connect AI agents to your workspace through the SDKs, the hooks, the MCP server, and
              third-party agent connectors such as the Claude app or Meta Muse. When you authorize a
              connector, it acts inside your workspace with the scope you approved. Governance decisions
              it records are yours, and you can revoke its access from the workspace at any time.
            </p>
            <p>
              DashClaw records what your agents try to do so a human can approve or refuse it. It does not
              perform those actions itself, and it is not a guarantee that an agent will obey a decision.
              You remain responsible for what your agents do in the systems they touch.
            </p>
          </Section>

          <Section id="acceptable-use" title="Acceptable use">
            <p>
              Do not use the hosted trial to attack, probe, or overload our systems or anyone else&apos;s,
              to store content you do not have the right to store, or to route activity that is illegal
              where you or we are. We can suspend a workspace that does.
            </p>
          </Section>

          <Section id="data" title="Your data">
            <p>
              What we collect on the hosted trial, where it lives, and how to get it deleted is described in
              the{' '}
              <Link href="/privacy" className="text-brand hover:underline">
                Privacy Policy
              </Link>
              . Your governance records stay yours. You can export them at any time and take them to a
              self-hosted instance.
            </p>
          </Section>

          <Section id="liability" title="No warranty, limited liability">
            <p>
              The hosted trial is provided as is and as available, without warranties of any kind. To the
              fullest extent the law allows, we are not liable for indirect, incidental, or consequential
              damages arising from the trial, and our total liability for any claim is limited to the amount
              you paid us for it, which for the trial is nothing.
            </p>
          </Section>

          <Section id="changes" title="Changes">
            <p>
              We update these terms when the product changes. Material changes are noted in the{' '}
              <a
                href="https://github.com/ucsandman/DashClaw/blob/main/CHANGELOG.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                changelog
              </a>{' '}
              and reflected in the date at the top of this page.
            </p>
          </Section>

          <Section id="contact" title="Contact">
            <p>
              Questions:{' '}
              <a href="mailto:team@dashclaw.io" className="text-brand hover:underline">
                team@dashclaw.io
              </a>
              .
            </p>
          </Section>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
