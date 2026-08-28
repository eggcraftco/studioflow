import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const meta: MetaFunction = () => [
  { title: "NivaDesk — Custom Order Management for Shopify" },
  {
    name: "description",
    content:
      "NivaDesk turns Shopify orders into organised production workflows with statuses, task checklists, and team assignment.",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <img
          className={styles.logo}
          src="/nivadesk-logo.png"
          alt="NivaDesk"
          width={240}
          height={60}
        />
        <h1 className={styles.heading}>
          Custom Order Management for Shopify
        </h1>
        <p className={styles.text}>
          NivaDesk turns Shopify orders into organised production workflows —
          statuses, task checklists, and team assignment, synced across web,
          Mac, iPhone, and Android.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input
                className={styles.input}
                type="text"
                name="shop"
                placeholder="my-shop.myshopify.com"
              />
              <span className={styles.hint}>
                Enter your store domain to install or open the app.
              </span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Automatic order sync.</strong> New paid orders arrive in
            your NivaDesk workspace within seconds, and a one-click import
            brings in past orders — duplicates are skipped automatically.
          </li>
          <li>
            <strong>Production workflows.</strong> Give every incoming order a
            starting stage, a task checklist, and an assignee, with optional
            product, collection, and tag filters.
          </li>
          <li>
            <strong>Fulfilment visibility.</strong> Shopify fulfilments mark
            the NivaDesk order dispatched with courier and tracking details,
            so your production board always matches reality.
          </li>
        </ul>
        <p className={styles.footer}>
          <a href="https://nivadesk.app" target="_blank" rel="noreferrer">
            nivadesk.app
          </a>
          {" · "}
          <a
            href="https://nivadesk.app/guide"
            target="_blank"
            rel="noreferrer"
          >
            Setup guide
          </a>
          {" · "}
          <a
            href="https://nivadesk.app/privacy"
            target="_blank"
            rel="noreferrer"
          >
            Privacy
          </a>
          {" · "}
          <a
            href="https://nivadesk.app/terms"
            target="_blank"
            rel="noreferrer"
          >
            Terms
          </a>
          {" · "}
          <a href="mailto:contact@nivadesk.co.uk">contact@nivadesk.co.uk</a>
        </p>
      </div>
    </div>
  );
}
