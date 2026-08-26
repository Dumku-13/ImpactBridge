import { apiFetchText } from "./api";

/**
 * Open a donation receipt in a new tab.
 *
 * The receipt endpoint requires the Authorization header, which a plain link
 * cannot send, so we fetch the HTML ourselves and hand the new tab a blob URL.
 *
 * The blank tab is opened SYNCHRONOUSLY, before any await. Browsers only allow
 * window.open during a user gesture; opening it after the fetch resolves would
 * be treated as an unsolicited popup and blocked.
 */
export async function openReceipt(donationId: string): Promise<void> {
  const tab = window.open("", "_blank", "noopener,noreferrer");

  try {
    const html = await apiFetchText(`/donations/${donationId}/receipt`);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));

    if (tab) {
      tab.location.href = url;
    } else {
      // Popup blocked — fall back to a download so the receipt isn't lost.
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt-${donationId}.html`;
      link.click();
    }

    // Release the object URL once the tab has had time to load it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}
