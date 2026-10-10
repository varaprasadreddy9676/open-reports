// Chapter order for the flagship film. Each module exports run(film, state).
import { coldOpen, ingredients } from "./01-opening.mjs";
import * as buildInvoice from "./03-build-invoice.mjs";
import * as subreport from "./04-subreport.mjs";
import * as saveAndOpen from "./05-save-and-open.mjs";
import * as caredeskPrint from "./06-caredesk-print.mjs";
import * as branches from "./07-branches.mjs";
import * as embeddedDesigner from "./08-embedded-designer.mjs";
import * as ledgerline from "./09-ledgerline.mjs";
import * as recap from "./10-recap.mjs";

export const CHAPTERS = [
  { id: "01-cold-open", run: coldOpen },
  { id: "02-ingredients", run: ingredients },
  { id: "03-build-invoice", run: buildInvoice.run },
  { id: "04-subreport", run: subreport.run },
  { id: "05-save-and-open", run: saveAndOpen.run },
  { id: "06-caredesk-print", run: caredeskPrint.run },
  { id: "07-branches", run: branches.run },
  { id: "08-embedded-designer", run: embeddedDesigner.run },
  { id: "09-ledgerline", run: ledgerline.run },
  { id: "10-recap", run: recap.run },
];
