import { Document, Image, Page, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';

import type { DocCompany, DocParty, DocStamp, DocTotal } from '@/features/documents/documentModel';
import { pdfColor, pdfSize, pdfStyles as s, pdfWeight } from '@/features/pdf/pdfTheme';
import { formatMoney } from '@/utils/money';

/** A logo @react-pdf can embed: PNG or JPEG, as a data URI or an https URL. */
export const embeddableLogo = (logo: string | null | undefined): string | null => {
  if (!logo) return null;
  if (/^data:image\/(png|jpe?g);base64,/i.test(logo)) return logo;
  if (/^https:\/\/.+\.(png|jpe?g)(\?.*)?$/i.test(logo)) return logo;
  return null;
};

const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || 'FM';

export function PdfFile({
  title,
  author,
  children,
}: {
  title: string;
  author: string;
  children: ReactNode;
}) {
  return (
    <Document title={title} author={author} creator="FinMatrix" producer="FinMatrix">
      {children}
    </Document>
  );
}

/**
 * One A4 sheet: brand rule, letterhead, the content, a status stamp, and a
 * footer that repeats on every page with "Page x of y".
 */
export function PdfSheet({
  company,
  kind,
  number,
  subtitle,
  stamp,
  generatedAt,
  children,
}: {
  company: DocCompany;
  kind: string;
  number?: string;
  subtitle?: string;
  stamp?: DocStamp | null;
  generatedAt: string;
  children: ReactNode;
}) {
  const logo = embeddableLogo(company.logo);
  const stampColor =
    stamp?.tone === 'success' ? pdfColor.success : stamp?.tone === 'danger' ? pdfColor.danger : pdfColor.faint;

  return (
    <Page size="A4" style={s.page} wrap>
      <View fixed style={s.topBar} />

      {stamp && (
        <View
          fixed
          style={{ position: 'absolute', top: 330, left: 0, right: 0, alignItems: 'center' }}
        >
          <Text
            style={{
              fontSize: pdfSize.stamp,
              fontWeight: pdfWeight.bold,
              color: stampColor,
              opacity: 0.1,
              letterSpacing: 6,
              transform: 'rotate(-24deg)',
              textTransform: 'uppercase',
            }}
          >
            {stamp.label}
          </Text>
        </View>
      )}

      {/* Letterhead */}
      <View style={[s.spaceBetween, { marginBottom: 18, alignItems: 'flex-start' }]}>
        <View style={[s.row, { maxWidth: 300, alignItems: 'flex-start' }]}>
          {logo ? (
            <Image src={logo} style={{ width: 46, height: 46, objectFit: 'contain', marginRight: 10 }} />
          ) : (
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 6,
                backgroundColor: pdfColor.brand,
                marginRight: 10,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: pdfColor.paper, fontSize: pdfSize.subheading, fontWeight: pdfWeight.bold }}>
                {initials(company.name)}
              </Text>
            </View>
          )}
          <View style={{ flexShrink: 1 }}>
            <Text style={{ fontSize: pdfSize.heading, fontWeight: pdfWeight.bold, lineHeight: 1.25, marginBottom: 2 }}>
              {company.name}
            </Text>
            {company.addressLines.map((line) => (
              <Text key={line} style={[s.small, s.muted]}>
                {line}
              </Text>
            ))}
            {company.contactLines.map((line) => (
              <Text key={line} style={[s.small, s.muted]}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        <View style={{ alignItems: 'flex-end', maxWidth: 220 }}>
          <Text
            style={{
              fontSize: pdfSize.title,
              fontWeight: pdfWeight.bold,
              color: pdfColor.brand,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              textAlign: 'right',
              lineHeight: 1.2,
              marginBottom: 3,
            }}
          >
            {kind}
          </Text>
          {number ? (
            <Text style={{ fontSize: pdfSize.subheading, fontWeight: pdfWeight.medium, marginTop: 2 }}>
              {number}
            </Text>
          ) : null}
          {subtitle ? <Text style={[s.small, s.muted, { marginTop: 2, textAlign: 'right' }]}>{subtitle}</Text> : null}
        </View>
      </View>

      <View style={[s.rule, { marginBottom: 16 }]} />

      {children}

      <View fixed style={s.footer}>
        <Text>
          {company.name} · Generated with FinMatrix · {generatedAt}
        </Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  );
}

/** Who the document is for, beside its reference fields. */
export function PdfPartyAndMeta({
  party,
  meta,
}: {
  party?: DocParty | null;
  meta: { label: string; value: string }[];
}) {
  return (
    <View style={[s.spaceBetween, { marginBottom: 18, alignItems: 'flex-start' }]}>
      <View style={{ maxWidth: 280 }}>
        {party ? (
          <>
            <Text style={s.overline}>{party.label}</Text>
            <Text style={{ fontSize: pdfSize.subheading, fontWeight: pdfWeight.bold, marginTop: 3 }}>
              {party.name || '—'}
            </Text>
            {party.lines.map((line) => (
              <Text key={line} style={[s.small, s.muted]}>
                {line}
              </Text>
            ))}
          </>
        ) : null}
      </View>
      {meta.length > 0 && (
        <View
          style={{
            minWidth: 190,
            borderWidth: 0.6,
            borderColor: pdfColor.ruleLight,
            borderRadius: 4,
            paddingVertical: 6,
            paddingHorizontal: 9,
          }}
        >
          {meta.map((m) => (
            <View key={m.label} style={[s.spaceBetween, { paddingVertical: 1.5 }]}>
              <Text style={[s.small, s.muted, { marginRight: 14 }]}>{m.label}</Text>
              <Text style={[s.small, s.medium]}>{m.value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export interface PdfColumn {
  header: string;
  /** Relative width. */
  flex: number;
  align?: 'left' | 'right';
}

export interface PdfTableRow {
  cells: string[];
  /** A second, smaller line under the first cell. */
  sub?: string;
  bold?: boolean;
  /** A subtotal: ruled above, bold. */
  total?: boolean;
  /** The bottom line: tinted band under a heavy rule. */
  grand?: boolean;
  /** A section heading inside the table, in the brand colour. */
  heading?: boolean;
  /** How far the first cell is indented, in levels. */
  depth?: number;
}

/**
 * A ruled table with a tinted header and zebra rows; a row never splits across
 * pages. Statements use the heading, subtotal and bottom-line rows so they read
 * the way an accountant lays one out.
 */
export function PdfTable({
  columns,
  rows,
  emphasis,
}: {
  columns: PdfColumn[];
  rows: PdfTableRow[];
  emphasis?: boolean;
}) {
  let zebra = 0;
  return (
    <View style={{ marginBottom: 14 }}>
      <View
        style={[
          s.row,
          {
            backgroundColor: pdfColor.brandTint,
            borderRadius: 3,
            paddingVertical: 5,
            paddingHorizontal: 6,
          },
        ]}
      >
        {columns.map((c, ci) => (
          <Text
            key={ci}
            style={[
              s.overline,
              { flex: c.flex, textAlign: c.align ?? 'left', color: pdfColor.brand, paddingHorizontal: 2 },
            ]}
          >
            {c.header}
          </Text>
        ))}
      </View>
      {rows.map((row, i) => {
        const plain = !row.total && !row.grand && !row.heading;
        const band = plain && zebra++ % 2 === 1;
        const strong = row.bold || row.total || row.grand || row.heading;
        return (
          <View
            key={i}
            wrap={false}
            style={[
              s.row,
              {
                paddingVertical: row.grand ? 6 : emphasis ? 5 : 4,
                paddingHorizontal: 6,
                backgroundColor: row.grand ? pdfColor.brandTint : band ? pdfColor.band : pdfColor.paper,
                borderBottomWidth: plain ? 0.5 : 0,
                borderBottomColor: pdfColor.ruleLight,
                borderTopWidth: row.grand ? 1.2 : row.total ? 0.8 : 0,
                borderTopColor: row.grand ? pdfColor.ink : pdfColor.rule,
                marginTop: row.heading && i > 0 ? 6 : row.grand ? 3 : 0,
              },
            ]}
          >
            {row.cells.map((cell, ci) => {
              const col = columns[ci];
              return (
                <View
                  key={ci}
                  style={{
                    flex: col?.flex ?? 1,
                    paddingRight: 2,
                    paddingLeft: ci === 0 ? 2 + (row.depth ?? 0) * 10 : 2,
                  }}
                >
                  <Text
                    style={{
                      textAlign: col?.align ?? 'left',
                      fontWeight: strong ? pdfWeight.bold : pdfWeight.regular,
                      color: row.heading ? pdfColor.brand : pdfColor.ink,
                    }}
                  >
                    {cell}
                  </Text>
                  {ci === 0 && row.sub ? <Text style={[s.small, s.faint]}>{row.sub}</Text> : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/** The totals block, right-aligned. */
export function PdfTotals({ totals }: { totals: DocTotal[] }) {
  if (totals.length === 0) return null;
  return (
    <View wrap={false} style={{ alignSelf: 'flex-end', width: 230, marginBottom: 16 }}>
      {totals.map((t) => (
        <View key={t.label}>
          {t.dividerBefore && <View style={[s.rule, { marginVertical: 4 }]} />}
          <View
            style={[
              s.spaceBetween,
              {
                paddingVertical: t.grand ? 5 : 2,
                paddingHorizontal: t.grand ? 7 : 0,
                backgroundColor: t.grand ? pdfColor.brandTint : pdfColor.paper,
                borderRadius: 3,
                marginTop: t.grand ? 3 : 0,
              },
            ]}
          >
            <Text
              style={{
                color: t.strong || t.grand ? pdfColor.ink : pdfColor.muted,
                fontWeight: t.strong || t.grand ? pdfWeight.bold : pdfWeight.regular,
                fontSize: t.grand ? pdfSize.subheading : pdfSize.body,
              }}
            >
              {t.label}
            </Text>
            <Text
              style={{
                fontWeight: t.strong || t.grand ? pdfWeight.bold : pdfWeight.medium,
                fontSize: t.grand ? pdfSize.subheading : pdfSize.body,
                color:
                  t.tone === 'success' ? pdfColor.success : t.tone === 'danger' ? pdfColor.danger : pdfColor.ink,
              }}
            >
              {(t.prefix ?? '') + formatMoney(t.value)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function PdfNotes({ notes }: { notes: { title: string; text: string }[] }) {
  const visible = notes.filter((n) => n.text.trim().length > 0);
  if (visible.length === 0) return null;
  return (
    <View style={{ marginBottom: 14 }}>
      {visible.map((n) => (
        <View key={n.title} wrap={false} style={{ marginBottom: 8 }}>
          <Text style={s.overline}>{n.title}</Text>
          <Text style={[s.muted, { marginTop: 3 }]}>{n.text}</Text>
        </View>
      ))}
    </View>
  );
}

/** Signature lines at the foot of documents that are signed off on paper. */
export function PdfSignatures({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <View wrap={false} style={[s.row, { marginTop: 36, justifyContent: 'space-between' }]}>
      {labels.map((label) => (
        <View key={label} style={{ width: 170 }}>
          <View style={[s.rule, { marginBottom: 4 }]} />
          <Text style={[s.small, s.muted]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}
