import 'package:flutter/material.dart';

import '../api_client.dart';

class RegistrationScreen extends StatefulWidget {
  const RegistrationScreen({super.key});
  @override
  State<RegistrationScreen> createState() => _RegistrationScreenState();
}

class _RegistrationScreenState extends State<RegistrationScreen> {
  final _form = GlobalKey<FormState>();
  final _fields = {
    for (final key in ['name', 'ftcId', 'phone', 'evidence'])
      key: TextEditingController(),
  };
  bool _busy = false;
  String? _error, _confirmation;
  @override
  void dispose() {
    for (final c in _fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ApiScope.of(context).request(
        'POST',
        '/auth/registration',
        body: {
          for (final entry in _fields.entries)
            entry.key: entry.key == 'ftcId'
                ? int.parse(entry.value.text.trim())
                : entry.value.text.trim(),
        },
      );
      if (mounted) setState(() => _confirmation = result['message'] as String);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Request membership')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: _confirmation != null
            ? Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_confirmation!),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Back to sign-in'),
                    ),
                  ],
                ),
              )
            : Form(
                key: _form,
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Already in the roster? Sign in directly with your listed number. Use this form only if you are a new member. Approval requires an administrator to confirm your 81st FTC membership.',
                      ),
                      const SizedBox(height: 20),
                      for (final entry in {
                        'name': 'Full name',
                        'ftcId': 'FTC ID',
                        'phone': 'Login phone number',
                        'evidence': 'Section, cadre and membership details for verification',
                      }.entries)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: TextFormField(
                            controller: _fields[entry.key],
                            decoration: InputDecoration(labelText: entry.value),
                            maxLength: entry.key == 'evidence'
                                ? 2000
                                : entry.key == 'name'
                                ? 150
                                : 40,
                            minLines: entry.key == 'evidence' ? 3 : 1,
                            maxLines: entry.key == 'evidence' ? 5 : 1,
                            keyboardType: entry.key == 'ftcId'
                                ? TextInputType.number
                                : entry.key == 'phone'
                                ? TextInputType.phone
                                : TextInputType.text,
                            validator: (v) => v == null || v.trim().isEmpty
                                ? 'Required'
                                : entry.key == 'ftcId' &&
                                      (int.tryParse(v.trim()) ?? 0) <= 0
                                ? 'Enter a valid FTC ID'
                                : null,
                          ),
                        ),
                      if (_error != null)
                        Text(
                          _error!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                      FilledButton(
                        onPressed: _busy ? null : _submit,
                        child: Text(
                          _busy ? 'Submitting…' : 'Submit for review',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    ),
  );
}
