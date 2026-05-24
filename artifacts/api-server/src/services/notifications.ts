import { db } from "@workspace/db";
import {
  changeEvents,
  companies,
  milestoneImpacts,
  milestones,
  notificationDeliveries,
  projectCompanies,
  projects,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "../lib/logger";

type EmailEnvelope = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

let cachedTransport: { transporter: Transporter; channel: "email" | "log" } | null = null;

function getTransport(): { transporter: Transporter; channel: "email" | "log" } {
  if (cachedTransport) return cachedTransport;

  const host = process.env.SMTP_HOST;
  if (host) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    cachedTransport = {
      transporter: nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
      }),
      channel: "email",
    };
    logger.info({ host, port }, "notifications: using SMTP transport");
  } else {
    cachedTransport = {
      transporter: nodemailer.createTransport({ jsonTransport: true }),
      channel: "log",
    };
    logger.warn(
      "notifications: SMTP_HOST not set — falling back to log-only transport (no real email will be sent)",
    );
  }
  return cachedTransport;
}

function deriveContact(companyName: string): { name: string; email: string } {
  const slug =
    companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 12) || "contact";
  return {
    name: `${companyName.split(" ")[0]} PM Lead`,
    email: `pm@${slug}.com`,
  };
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildEmail(args: {
  companyName: string;
  contactName: string;
  projectName: string;
  projectCode: string;
  milestoneCode: string;
  milestoneName: string;
  oldDate: Date;
  newDate: Date;
  changeReason: string;
  appBaseUrl: string;
  changeEventId: number;
  impactId: number;
}): EmailEnvelope {
  const respondUrl = `${args.appBaseUrl}/respond?impact=${args.impactId}`;
  const subject = `[${args.projectCode}] Schedule change on ${args.milestoneCode}: ${args.milestoneName}`;

  const text = [
    `Hi ${args.contactName},`,
    ``,
    `A change event has been opened on project ${args.projectName} (${args.projectCode}) that impacts ${args.companyName}.`,
    ``,
    `Milestone: ${args.milestoneCode} — ${args.milestoneName}`,
    `Previous date: ${fmtDate(args.oldDate)}`,
    `Proposed new date: ${fmtDate(args.newDate)}`,
    `Reason: ${args.changeReason}`,
    ``,
    `Please review and submit your impact response:`,
    `${respondUrl}`,
    ``,
    `Thanks,`,
    `Construction Milestones`,
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px">
      <p>Hi ${args.contactName},</p>
      <p>A change event has been opened on project <strong>${args.projectName}</strong> (${args.projectCode}) that impacts <strong>${args.companyName}</strong>.</p>
      <table style="border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:4px 8px;color:#666">Milestone</td><td style="padding:4px 8px"><strong>${args.milestoneCode}</strong> — ${args.milestoneName}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Previous date</td><td style="padding:4px 8px"><s>${fmtDate(args.oldDate)}</s></td></tr>
        <tr><td style="padding:4px 8px;color:#666">Proposed new date</td><td style="padding:4px 8px"><strong>${fmtDate(args.newDate)}</strong></td></tr>
        <tr><td style="padding:4px 8px;color:#666">Reason</td><td style="padding:4px 8px">${args.changeReason}</td></tr>
      </table>
      <p>
        <a href="${respondUrl}" style="background:#1f6feb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">
          Review and respond
        </a>
      </p>
      <p style="color:#888;font-size:12px">Construction Milestones</p>
    </div>
  `.trim();

  return { to: "", subject, text, html };
}

export type SendResult = {
  impactId: number;
  projectCompanyId: number;
  companyName: string;
  recipientEmail: string;
  status: "Sent" | "Failed";
  channel: "email" | "log";
  errorMessage: string | null;
  deliveryId: number;
};

function buildCancellationEmail(args: {
  companyName: string;
  contactName: string;
  projectName: string;
  projectCode: string;
  milestoneCode: string;
  milestoneName: string;
  oldDate: Date;
  proposedNewDate: Date;
  changeReason: string;
}): EmailEnvelope {
  const subject = `[${args.projectCode}] Withdrawn: schedule change on ${args.milestoneCode}: ${args.milestoneName}`;

  const text = [
    `Hi ${args.contactName},`,
    ``,
    `The following change event on project ${args.projectName} (${args.projectCode}) has been withdrawn by the PM. No response is required from ${args.companyName}.`,
    ``,
    `Milestone: ${args.milestoneCode} — ${args.milestoneName}`,
    `Previous date (unchanged): ${fmtDate(args.oldDate)}`,
    `Withdrawn proposed date: ${fmtDate(args.proposedNewDate)}`,
    `Original reason: ${args.changeReason}`,
    ``,
    `You can disregard the earlier notification.`,
    ``,
    `Thanks,`,
    `Construction Milestones`,
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px">
      <p>Hi ${args.contactName},</p>
      <p>The following change event on project <strong>${args.projectName}</strong> (${args.projectCode}) has been <strong>withdrawn</strong> by the PM. No response is required from <strong>${args.companyName}</strong>.</p>
      <table style="border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:4px 8px;color:#666">Milestone</td><td style="padding:4px 8px"><strong>${args.milestoneCode}</strong> — ${args.milestoneName}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Previous date (unchanged)</td><td style="padding:4px 8px">${fmtDate(args.oldDate)}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Withdrawn proposed date</td><td style="padding:4px 8px"><s>${fmtDate(args.proposedNewDate)}</s></td></tr>
        <tr><td style="padding:4px 8px;color:#666">Original reason</td><td style="padding:4px 8px">${args.changeReason}</td></tr>
      </table>
      <p>You can disregard the earlier notification.</p>
      <p style="color:#888;font-size:12px">Construction Milestones</p>
    </div>
  `.trim();

  return { to: "", subject, text, html };
}

export async function sendChangeEventCancellationNotices(opts: {
  changeEventId: number;
  triggeredByUserId: number | null;
}): Promise<SendResult[]> {
  const { changeEventId, triggeredByUserId } = opts;

  const [ev] = await db
    .select({
      id: changeEvents.id,
      milestoneId: changeEvents.milestoneId,
      oldDate: changeEvents.oldDate,
      proposedNewDate: changeEvents.proposedNewDate,
      changeReason: changeEvents.changeReason,
      milestoneCode: milestones.code,
      milestoneName: milestones.name,
      projectName: projects.name,
      projectCode: projects.code,
    })
    .from(changeEvents)
    .innerJoin(milestones, eq(milestones.id, changeEvents.milestoneId))
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .where(eq(changeEvents.id, changeEventId))
    .limit(1);

  if (!ev) {
    throw new Error(`Change event ${changeEventId} not found`);
  }

  // Only notify contractors who actually received the original change-event
  // notification. Impacts that were never sent (e.g. event cancelled while
  // still in Draft) shouldn't generate a withdrawal notice.
  const previouslyNotified = await db
    .selectDistinct({ milestoneImpactId: notificationDeliveries.milestoneImpactId })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.changeEventId, changeEventId),
        eq(notificationDeliveries.status, "Sent"),
      ),
    );

  const notifiedImpactIds = previouslyNotified.map((r) => r.milestoneImpactId);
  if (notifiedImpactIds.length === 0) return [];

  const impacts = await db
    .select({
      id: milestoneImpacts.id,
      projectCompanyId: milestoneImpacts.projectCompanyId,
      oldDate: milestoneImpacts.oldDate,
      newDate: milestoneImpacts.newDate,
      companyName: companies.name,
    })
    .from(milestoneImpacts)
    .innerJoin(projectCompanies, eq(projectCompanies.id, milestoneImpacts.projectCompanyId))
    .innerJoin(companies, eq(companies.id, projectCompanies.companyId))
    .where(inArray(milestoneImpacts.id, notifiedImpactIds));

  if (impacts.length === 0) return [];

  const { transporter, channel } = getTransport();
  const fromAddress = process.env.SMTP_FROM ?? "notifications@construction-milestones.local";

  const results: SendResult[] = [];

  for (const impact of impacts) {
    const contact = deriveContact(impact.companyName);
    const envelope = buildCancellationEmail({
      companyName: impact.companyName,
      contactName: contact.name,
      projectName: ev.projectName,
      projectCode: ev.projectCode,
      milestoneCode: ev.milestoneCode,
      milestoneName: ev.milestoneName,
      oldDate: impact.oldDate,
      proposedNewDate: impact.newDate,
      changeReason: ev.changeReason,
    });

    let status: "Sent" | "Failed" = "Sent";
    let errorMessage: string | null = null;

    try {
      await transporter.sendMail({
        from: fromAddress,
        to: contact.email,
        subject: envelope.subject,
        text: envelope.text,
        html: envelope.html,
      });
      logger.info(
        { changeEventId, impactId: impact.id, to: contact.email, channel },
        "notifications: delivered change-event withdrawal notice",
      );
    } catch (err) {
      status = "Failed";
      errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        { changeEventId, impactId: impact.id, to: contact.email, channel, err: errorMessage },
        "notifications: withdrawal delivery failed",
      );
    }

    const [delivery] = await db
      .insert(notificationDeliveries)
      .values({
        changeEventId,
        milestoneImpactId: impact.id,
        projectCompanyId: impact.projectCompanyId,
        channel,
        status,
        recipientEmail: contact.email,
        subject: envelope.subject,
        errorMessage,
        triggeredByUserId,
      })
      .returning({ id: notificationDeliveries.id });

    results.push({
      impactId: impact.id,
      projectCompanyId: impact.projectCompanyId,
      companyName: impact.companyName,
      recipientEmail: contact.email,
      status,
      channel,
      errorMessage,
      deliveryId: delivery.id,
    });
  }

  return results;
}

export async function sendChangeEventNotifications(opts: {
  changeEventId: number;
  /** Limit to specific milestone_impact ids; if omitted, all impacts on the event are notified */
  impactIds?: number[];
  triggeredByUserId: number | null;
}): Promise<SendResult[]> {
  const { changeEventId, triggeredByUserId } = opts;

  const [ev] = await db
    .select({
      id: changeEvents.id,
      milestoneId: changeEvents.milestoneId,
      oldDate: changeEvents.oldDate,
      proposedNewDate: changeEvents.proposedNewDate,
      changeReason: changeEvents.changeReason,
      milestoneCode: milestones.code,
      milestoneName: milestones.name,
      projectId: milestones.projectId,
      projectName: projects.name,
      projectCode: projects.code,
    })
    .from(changeEvents)
    .innerJoin(milestones, eq(milestones.id, changeEvents.milestoneId))
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .where(eq(changeEvents.id, changeEventId))
    .limit(1);

  if (!ev) {
    throw new Error(`Change event ${changeEventId} not found`);
  }

  const whereImpacts = opts.impactIds && opts.impactIds.length > 0
    ? and(
        eq(milestoneImpacts.changeEventId, changeEventId),
        inArray(milestoneImpacts.id, opts.impactIds),
      )
    : eq(milestoneImpacts.changeEventId, changeEventId);

  const impacts = await db
    .select({
      id: milestoneImpacts.id,
      projectCompanyId: milestoneImpacts.projectCompanyId,
      oldDate: milestoneImpacts.oldDate,
      newDate: milestoneImpacts.newDate,
      companyName: companies.name,
    })
    .from(milestoneImpacts)
    .innerJoin(projectCompanies, eq(projectCompanies.id, milestoneImpacts.projectCompanyId))
    .innerJoin(companies, eq(companies.id, projectCompanies.companyId))
    .where(whereImpacts);

  if (impacts.length === 0) return [];

  const { transporter, channel } = getTransport();
  const fromAddress = process.env.SMTP_FROM ?? "notifications@construction-milestones.local";
  const appBaseUrl =
    process.env.APP_BASE_URL ??
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost");

  const results: SendResult[] = [];

  for (const impact of impacts) {
    const contact = deriveContact(impact.companyName);
    const envelope = buildEmail({
      companyName: impact.companyName,
      contactName: contact.name,
      projectName: ev.projectName,
      projectCode: ev.projectCode,
      milestoneCode: ev.milestoneCode,
      milestoneName: ev.milestoneName,
      oldDate: impact.oldDate,
      newDate: impact.newDate,
      changeReason: ev.changeReason,
      appBaseUrl,
      changeEventId,
      impactId: impact.id,
    });

    let status: "Sent" | "Failed" = "Sent";
    let errorMessage: string | null = null;

    try {
      await transporter.sendMail({
        from: fromAddress,
        to: contact.email,
        subject: envelope.subject,
        text: envelope.text,
        html: envelope.html,
      });
      logger.info(
        {
          changeEventId,
          impactId: impact.id,
          to: contact.email,
          channel,
        },
        "notifications: delivered change-event notice",
      );
    } catch (err) {
      status = "Failed";
      errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          changeEventId,
          impactId: impact.id,
          to: contact.email,
          channel,
          err: errorMessage,
        },
        "notifications: delivery failed",
      );
    }

    const [delivery] = await db
      .insert(notificationDeliveries)
      .values({
        changeEventId,
        milestoneImpactId: impact.id,
        projectCompanyId: impact.projectCompanyId,
        channel,
        status,
        recipientEmail: contact.email,
        subject: envelope.subject,
        errorMessage,
        triggeredByUserId,
      })
      .returning({ id: notificationDeliveries.id });

    if (status === "Sent") {
      await db
        .update(milestoneImpacts)
        .set({ notifiedAt: new Date() })
        .where(eq(milestoneImpacts.id, impact.id));
    }

    results.push({
      impactId: impact.id,
      projectCompanyId: impact.projectCompanyId,
      companyName: impact.companyName,
      recipientEmail: contact.email,
      status,
      channel,
      errorMessage,
      deliveryId: delivery.id,
    });
  }

  return results;
}
