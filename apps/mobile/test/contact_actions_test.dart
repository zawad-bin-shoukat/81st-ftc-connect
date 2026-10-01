import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ftc_connect/contact_actions.dart';

void main() {
  test(
    'contact links accept single numbers and reject ambiguous free text',
    () {
      expect(contactNumber('০১৭১২-৩৪৫৬৭৮'), '+8801712345678');
      expect(contactNumber('8801712345678'), '+8801712345678');
      expect(contactNumber('+1 (202) 555-0100'), '+12025550100');
      for (final raw in [
        '1712345678',
        '01712345678 / 01812345678',
        '01712345678 ext 2',
        'N/A',
        '+880123',
        'tel:+8801712345678',
      ]) {
        expect(contactNumber(raw), isNull, reason: raw);
      }
    },
  );
  testWidgets('Call and WhatsApp open only the chosen contact destination', (
    tester,
  ) async {
    final opened = <Uri>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ContactActions(
            raw: '01712345678',
            launcher: (uri) async {
              opened.add(uri);
              return true;
            },
          ),
        ),
      ),
    );
    await tester.tap(find.text('Call'));
    await tester.pumpAndSettle();
    expect(opened.single.toString(), 'tel:+8801712345678');
    await tester.tap(find.text('WhatsApp'));
    await tester.pumpAndSettle();
    expect(opened.last.toString(), 'https://wa.me/8801712345678');
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: ContactActions(raw: 'unknown / two numbers')),
      ),
    );
    expect(find.text('Call'), findsNothing);
    expect(find.text('WhatsApp'), findsNothing);
    expect(find.text('Copy'), findsOneWidget);
  });
}
