import 'dart:async';

import 'package:flutter/material.dart';

import '../api_client.dart';

class VerifyCodeScreen extends StatefulWidget {
  const VerifyCodeScreen({
    required this.phone,
    required this.challenge,
    required this.requestPath,
    required this.requestBody,
    super.key,
  });
  final String phone;
  final Map<String, dynamic> challenge;
  final String requestPath;
  final Map<String, dynamic> requestBody;
  @override
  State<VerifyCodeScreen> createState() => _VerifyCodeScreenState();
}

class _VerifyCodeScreenState extends State<VerifyCodeScreen> {
  final _code = TextEditingController();
  late Map<String, dynamic> _challenge = widget.challenge;
  late final Timer _timer;
  int _cooldown = 60;
  bool _busy = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_cooldown > 0 && mounted) setState(() => _cooldown--);
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (!RegExp(r'^\d{6}$').hasMatch(_code.text.trim())) {
      setState(() => _error = 'Enter the six-digit code.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ApiScope.of(context);
      final session = await api.request(
        'POST',
        '/auth/verify',
        body: {
          'challengeId': _challenge['challengeId'],
          'code': _code.text.trim(),
        },
      );
      await api.acceptSession(session['token'] as String);
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final challenge = await ApiScope.of(context)
          .request('POST', widget.requestPath, body: widget.requestBody);
      if (mounted) {
        setState(() {
          _challenge = challenge;
          _cooldown = 60;
          _code.clear();
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Verify phone')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Icon(Icons.sms_outlined, size: 56),
            const SizedBox(height: 20),
            Text(
              'Enter your code',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(widget.phone),
            const SizedBox(height: 24),
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              maxLength: 6,
              autofillHints: const [AutofillHints.oneTimeCode],
              decoration: const InputDecoration(labelText: 'Verification code'),
              onSubmitted: (_) {
                if (!_busy) _verify();
              },
            ),
            if (_error != null)
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            FilledButton(
              onPressed: _busy ? null : _verify,
              child: Text(_busy ? 'Please wait…' : 'Verify and continue'),
            ),
            TextButton(
              onPressed: _busy || _cooldown > 0 ? null : _resend,
              child: Text(
                _cooldown > 0
                    ? 'Request another code in $_cooldown seconds'
                    : 'Request another code',
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Local test — no SMS was sent. On your Mac, run this command from the project folder:',
                    ),
                    const SizedBox(height: 8),
                    SelectableText(
                      './scripts/backend.sh auth:code -- ${_challenge['challengeId'] as String}',
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Codes expire after 5 minutes. If no code is available, check your roster number or contact the administrator.',
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
