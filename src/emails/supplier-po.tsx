import {
  Body, Container, Head, Heading, Hr, Html, Preview,
  Row, Section, Text, Column,
} from '@react-email/components';

interface POLine { product_name: string; sku?: string | null; qty: number; unit_cost: number; total: number; }

interface SupplierPOEmailProps {
  poId: string;
  businessName: string;
  businessContact: string;
  supplierName: string;
  supplierContactName?: string;
  lines: POLine[];
  totalCost: number;
  deliveryAddress: string;
  requiredByDate: string;
}

export function SupplierPOEmail({
  poId, businessName, businessContact, supplierName, supplierContactName,
  lines, totalCost, deliveryAddress, requiredByDate,
}: SupplierPOEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Purchase Order #{poId} from {businessName}</Preview>
      <Body style={{ backgroundColor: '#f4f4f5', fontFamily: "'Manrope', sans-serif" }}>
        <Container style={{ maxWidth: 600, margin: '32px auto', backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden' }}>
          {/* Header */}
          <Section style={{ backgroundColor: '#08070D', padding: '24px 32px' }}>
            <Heading style={{ color: '#8B5CF6', fontSize: 22, fontWeight: 800, margin: 0 }}>Aria POS</Heading>
            <Text style={{ color: '#918AAE', margin: '4px 0 0', fontSize: 13 }}>Purchase Order for {businessName}</Text>
          </Section>

          <Section style={{ padding: '28px 32px' }}>
            <Text style={{ color: '#374151', fontSize: 15 }}>
              Hi {supplierContactName ?? supplierName},
            </Text>
            <Text style={{ color: '#374151', fontSize: 15 }}>
              Please find our purchase order below.
            </Text>

            <Hr style={{ borderColor: '#e5e7eb', margin: '20px 0' }} />

            {/* PO table */}
            <Section>
              <Row style={{ backgroundColor: '#f9fafb', borderRadius: 6 }}>
                <Column style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#6b7280', textTransform: 'uppercase' }}>Product</Column>
                <Column style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>SKU</Column>
                <Column style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Qty</Column>
                <Column style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#6b7280', textAlign: 'right' }}>Unit</Column>
                <Column style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#6b7280', textAlign: 'right' }}>Total</Column>
              </Row>
              {lines.map((line, i) => (
                <Row key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <Column style={{ padding: '10px 12px', fontSize: 13, color: '#111827' }}>{line.product_name}</Column>
                  <Column style={{ padding: '10px 12px', fontSize: 12, color: '#6b7280', textAlign: 'center' }}>{line.sku ?? '—'}</Column>
                  <Column style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, textAlign: 'center', color: '#111827' }}>{line.qty}</Column>
                  <Column style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right', color: '#374151' }}>A${line.unit_cost.toFixed(2)}</Column>
                  <Column style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, textAlign: 'right', color: '#111827' }}>A${line.total.toFixed(2)}</Column>
                </Row>
              ))}
              <Row style={{ backgroundColor: '#f9fafb' }}>
                <Column colSpan={4} style={{ padding: '12px', fontWeight: 700, fontSize: 14, color: '#111827', textAlign: 'right' }}>Total</Column>
                <Column style={{ padding: '12px', fontWeight: 800, fontSize: 16, color: '#8B5CF6', textAlign: 'right' }}>A${totalCost.toFixed(2)}</Column>
              </Row>
            </Section>

            <Hr style={{ borderColor: '#e5e7eb', margin: '20px 0' }} />

            <Text style={{ color: '#374151', fontSize: 13, margin: '8px 0' }}>
              <strong>Delivery to:</strong> {deliveryAddress}
            </Text>
            <Text style={{ color: '#374151', fontSize: 13, margin: '8px 0' }}>
              <strong>Required by:</strong> {requiredByDate}
            </Text>
            <Text style={{ color: '#374151', fontSize: 13, margin: '8px 0' }}>
              <strong>PO Reference:</strong> #{poId}
            </Text>

            <Hr style={{ borderColor: '#e5e7eb', margin: '20px 0' }} />

            <Text style={{ color: '#6b7280', fontSize: 13 }}>
              Reply to this email to confirm receipt of this order.
            </Text>
            <Text style={{ color: '#6b7280', fontSize: 13, margin: '4px 0' }}>
              Contact: {businessContact}
            </Text>
          </Section>

          {/* Footer */}
          <Section style={{ backgroundColor: '#f9fafb', padding: '16px 32px' }}>
            <Text style={{ color: '#9ca3af', fontSize: 11, margin: 0 }}>
              Generated by Aria POS · ariaos.site · This order was generated automatically and approved by {businessName}.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default SupplierPOEmail;
