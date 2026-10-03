import 'package:flutter/material.dart';

import '../api_client.dart';

class DeleteAccountScreen extends StatefulWidget {
  const DeleteAccountScreen({
    required this.api,
    required this.isTestAccount,
    super.key,
  });

  final ApiClient api;
  final bool isTestAccount;

  @override
  State<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends State<DeleteAccountScreen> {
  final _confirmation = TextEditingController();
  bool _deleting = false;
  String? _error;

  @override
  void dispose() {
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    if (_confirmation.text.trim() != 'DELETE' || _deleting) return;
    setState(() {
      _deleting = true;
      _error = null;
    });
    try {
      await widget.api.request('DELETE', '/me', body: {'confirm': 'DELETE'});
      await widget.api.forgetSession();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Delete account')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Icon(Icons.warning_amber_rounded, size: 64),
            const SizedBox(height: 20),
            Text(
              'Delete your account permanently?',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 12),
            Text(
              widget.isTestAccount
                  ? 'Your administrator/test profile and all its sign-in sessions will be removed. This does not remove any participant.'
                  : 'Your sign-in account and profile will be removed from the app directory. You will lose access immediately. This cannot be undone.',
            ),
            const SizedBox(height: 12),
            const Text(
              'Copies in existing backups may remain until those backups expire.',
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _confirmation,
              enabled: !_deleting,
              decoration: const InputDecoration(
                labelText: 'Type DELETE to confirm',
              ),
              onChanged: (_) => setState(() {}),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _deleting || _confirmation.text.trim() != 'DELETE'
                  ? null
                  : _delete,
              style: FilledButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.error,
              ),
              child: Text(_deleting ? 'Deleting…' : 'Delete my account'),
            ),
          ],
        ),
      ),
    ),
  );
}
