"use client";

import Link from "next/link";
import { PublicShell } from "@/components/PublicMarketing";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import { AMAZON_SELLER_COPY } from "@/lib/publicSite/amazonSellerCopy";
import { CLAUDE_HELP_COPY, type ClaudeHelpCopy } from "@/lib/publicSite/claudeHelpCopy";
import { CLAUDE_CONNECTOR_URL, claudeToolMode, type ClaudeToolMode } from "@/lib/studioflow/claudeConnector";
// The same palette, grid and RTL rules as /integrations/amazon and /integrations/shopify.
import styles from "../amazon/amazon.module.css";
import own from "./claude.module.css";

// The address the support page, the privacy policy and the Shopify guide all give.
const SUPPORT_EMAIL = "contact@nivadesk.co.uk";
// Settings › Integrations (the hub); the ChatGPT card there lists every assistant
// connection — ChatGPT, Claude, Claude Code — with Disconnect and Disconnect all.
const SETTINGS_INTEGRATIONS_HREF = "/settings?section=integrations";

function Check() {
  return (
    <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 10.5l3.2 3.2L15.5 6" />
    </svg>
  );
}

const MODE_CLASS: Record<ClaudeToolMode, string> = {
  read: own.modeRead,
  write: own.modeWrite,
  destructive: own.modeDestructive
};

function modeLabel(copy: ClaudeHelpCopy, mode: ClaudeToolMode) {
  return mode === "read" ? copy.modeRead : mode === "write" ? copy.modeWrite : copy.modeDestructive;
}

/** A Claude conversation drawn from its parts: the question, the tool call, the answer. */
function ConversationMock({ copy }: { copy: ClaudeHelpCopy }) {
  return (
    <figure className={styles.mockFigure}>
      <div className={styles.mockWindow} role="img" aria-label={copy.mockLabel}>
        <div className={styles.mockBar} aria-hidden="true"><span /><span /><span /></div>
        <div className={own.chat} aria-hidden="true">
          <p className={own.bubbleUser}>{copy.mockPrompt}</p>
          <p className={own.toolCall}>
            <span className={own.toolDot} />
            <span>{copy.mockTool}</span>
            <span className={`${own.modeTag} ${own.modeRead}`}>{copy.modeRead}</span>
          </p>
          <p className={own.bubbleAssistant}>{copy.mockReply}</p>
        </div>
      </div>
      <figcaption className={styles.mockCaption}>{copy.mockCaption}</figcaption>
    </figure>
  );
}

function ClaudeHelpContent() {
  const { language } = usePublicSiteLanguage();
  const copy = CLAUDE_HELP_COPY[language] ?? CLAUDE_HELP_COPY.English;
  // Labels shared with the Amazon page, already translated there (one source, no drift).
  const amazon = AMAZON_SELLER_COPY[language] ?? AMAZON_SELLER_COPY.English;

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="claude-help-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 id="claude-help-title">{copy.heroTitle}</h1>
          <p className={styles.intro}>{copy.heroIntro}</p>
          <div className={styles.actions}>
            <a className={styles.primary} href="#connect">{copy.ctaConnect}</a>
            <a className={styles.secondary} href="#tools">{copy.ctaTools}</a>
          </div>
          <ul className={styles.heroFacts}>
            {copy.heroFacts.map(fact => <li key={fact}><Check />{fact}</li>)}
          </ul>
        </div>
        <ConversationMock copy={copy} />
      </section>

      <section className={`${styles.statusBand} ${CLAUDE_CONNECTOR_URL ? own.statusLive : ""}`} aria-labelledby="claude-status-title">
        <div className={styles.statusInner}>
          <div className={styles.statusHead}>
            <p className={`${styles.statusEyebrow} ${CLAUDE_CONNECTOR_URL ? own.liveEyebrow : ""}`} id="claude-status-title">{copy.statusTitle}</p>
            <span className={`${styles.statusBadge} ${CLAUDE_CONNECTOR_URL ? own.liveBadge : ""}`}><span className={`${styles.statusDot} ${CLAUDE_CONNECTOR_URL ? own.liveDot : ""}`} aria-hidden="true" />{copy.statusLabel}</span>
          </div>
          <p className={CLAUDE_CONNECTOR_URL ? own.liveBody : undefined}>{copy.statusBody}</p>
        </div>
      </section>

      <section id="who" className={`${styles.section} ${own.anchor}`} aria-labelledby="claude-who">
        <h2 id="claude-who">{copy.whoTitle}</h2>
        <p className={styles.lead}>{copy.whoIntro}</p>
        <dl className={styles.dataList}>
          {copy.who.map(([title, body]) => (
            <div key={title}><dt>{title}</dt><dd>{body}</dd></div>
          ))}
        </dl>
      </section>

      <section id="connect" className={`${styles.section} ${own.anchor}`} aria-labelledby="claude-connect">
        <h2 id="claude-connect">{copy.connectTitle}</h2>
        <ol className={styles.steps}>
          {copy.connectSteps.map(([title, body], index) => (
            <li key={title}>
              <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
              <div><h3>{title}</h3><p>{body}</p></div>
            </li>
          ))}
        </ol>
        <div className={own.urlBox}>
          <span className={own.urlLabel}>{copy.urlLabel}</span>
          {CLAUDE_CONNECTOR_URL
            ? <code className={own.urlValue} dir="ltr" data-claude-connector-url="live">{CLAUDE_CONNECTOR_URL}</code>
            : <span className={own.urlPending} data-claude-connector-url="pending">{copy.urlPending}</span>}
        </div>
        {copy.connectNotes.map(note => <p key={note} className={styles.note}>{note}</p>)}
      </section>

      <section id="tools" className={`${styles.section} ${own.anchor}`} aria-labelledby="claude-tools">
        <h2 id="claude-tools">{copy.toolsTitle}</h2>
        <p className={styles.lead}>{copy.toolsIntro}</p>
        <div className={own.groups}>
          {copy.groups.map(group => (
            <article key={group.title} className={own.group}>
              <h3>{group.title}</h3>
              <p className={own.groupIntro}>{group.intro}</p>
              <ul className={own.toolList}>
                {group.tools.map(([name, what]) => {
                  const mode = claudeToolMode(name);
                  return (
                    <li key={name}>
                      <div className={own.toolHead}>
                        <code dir="ltr">{name}</code>
                        <span className={`${own.modeTag} ${MODE_CLASS[mode]}`}>{modeLabel(copy, mode)}</span>
                      </div>
                      <p>{what}</p>
                    </li>
                  );
                })}
              </ul>
              <p className={own.examplesLabel}>{copy.examplesLabel}</p>
              <ul className={own.examples}>
                {group.examples.map(example => <li key={example}>“{example}”</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="safety" className={`${styles.section} ${own.anchor}`} aria-labelledby="claude-safety">
        <h2 id="claude-safety">{copy.safetyTitle}</h2>
        <p className={styles.lead}>{copy.safetyIntro}</p>
        <dl className={styles.dataList}>
          {copy.safety.map(([title, body]) => (
            <div key={title}><dt>{title}</dt><dd>{body}</dd></div>
          ))}
        </dl>
      </section>

      <section id="data" className={`${styles.section} ${own.anchor}`} aria-labelledby="claude-data">
        <h2 id="claude-data">{copy.dataTitle}</h2>
        <dl className={styles.dataList}>
          {copy.data.map(([title, body]) => (
            <div key={title}><dt>{title}</dt><dd>{body}</dd></div>
          ))}
        </dl>
        <h3 className={styles.subhead}>{amazon.legalTitle}</h3>
        <ul className={styles.links}>
          <li><Link href="/privacy">{amazon.linkPrivacy}</Link></li>
          <li><Link href="/terms">{amazon.linkTerms}</Link></li>
          <li><Link href="/security">{amazon.linkSecurity}</Link></li>
          <li><Link href="/subprocessors">{amazon.linkSubprocessors}</Link></li>
          <li><Link href="/account-deletion">{amazon.linkDeletion}</Link></li>
        </ul>
      </section>

      <section id="disconnect" className={`${styles.section} ${own.anchor}`} aria-labelledby="claude-disconnect">
        <h2 id="claude-disconnect">{copy.disconnectTitle}</h2>
        <dl className={styles.dataList}>
          {copy.disconnect.map(([title, body]) => (
            <div key={title}><dt>{title}</dt><dd>{body}</dd></div>
          ))}
        </dl>
        <p className={styles.note}>{copy.disconnectNote}</p>
        <ul className={styles.links}>
          <li><Link href={SETTINGS_INTEGRATIONS_HREF}>{copy.disconnectLink}</Link></li>
        </ul>
      </section>

      <section id="faq" className={`${styles.section} ${own.anchor}`} aria-labelledby="claude-faq">
        <h2 id="claude-faq">{copy.faqTitle}</h2>
        <div className={styles.faq}>
          {copy.faq.map(([question, answer]) => (
            <details key={question} className={styles.faqItem}>
              <summary><span>{question}</span><span className={styles.faqMark} aria-hidden="true">+</span></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="support" className={`${styles.section} ${styles.contact} ${own.anchor}`} aria-labelledby="claude-contact">
        <h2 id="claude-contact">{copy.contactTitle}</h2>
        <p className={styles.lead}>{copy.contactBody}</p>
        <p className={styles.contactLine}>
          {amazon.contactEmailLabel}: <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr">{SUPPORT_EMAIL}</a>
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/contact">{amazon.contactPage}</Link>
        </div>
        <p className={styles.small}>{amazon.company}</p>
        <p className={styles.small}>{copy.trademark}</p>
      </section>
    </div>
  );
}

export default function ClaudeHelpPage() {
  return <PublicShell><ClaudeHelpContent /></PublicShell>;
}
