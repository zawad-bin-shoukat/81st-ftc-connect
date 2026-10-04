import 'dart:async';

import 'package:flutter/material.dart';

import '../api_client.dart';
import 'live_profile_screen.dart';

class LiveShell extends StatefulWidget {
  const LiveShell({required this.api, super.key});
  final ApiClient api;
  @override
  State<LiveShell> createState() => _LiveShellState();
}

class _LiveShellState extends State<LiveShell> {
  int _tab = 0;
  int _revision = 0;
  bool _loggingOut = false;
  Future<void> _logout() async {
    setState(() => _loggingOut = true);
    try {
      await widget.api.logout();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _loggingOut = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(_tab == 0 ? 'Member directory' : 'My profile'),
      actions: [
        TextButton(
          onPressed: _loggingOut ? null : _logout,
          child: Text(_loggingOut ? 'Signing out…' : 'Sign out'),
        ),
      ],
    ),
    body: Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Text(
            widget.api.isTestAccount
                ? 'Test account · outside the participant roster'
                : 'Private directory · 81st FTC members',
          ),
        ),
        Expanded(
          child: IndexedStack(
            index: _tab,
            children: [
              LiveDirectory(api: widget.api, key: ValueKey(_revision)),
              LiveProfileScreen(
                api: widget.api,
                onUpdated: () => setState(() => _revision++),
              ),
            ],
          ),
        ),
      ],
    ),
    bottomNavigationBar: NavigationBar(
      selectedIndex: _tab,
      onDestinationSelected: (index) => setState(() => _tab = index),
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.people_outline),
          label: 'Directory',
        ),
        NavigationDestination(
          icon: Icon(Icons.person_outline),
          label: 'My profile',
        ),
      ],
    ),
  );
}

class LiveDirectory extends StatefulWidget {
  const LiveDirectory({required this.api, super.key});
  final ApiClient api;
  @override
  State<LiveDirectory> createState() => _LiveDirectoryState();
}

class _LiveDirectoryState extends State<LiveDirectory> {
  final _search = TextEditingController();
  Timer? _debounce;
  Map<String, dynamic> _filters = {};
  final Map<String, String> _selected = {};
  List<dynamic> _items = [];
  int _page = 1, _pages = 0, _total = 0, _generation = 0;
  bool _busy = true;
  String? _error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final generation = ++_generation;
    setState(() {
      _busy = true;
      _error = null;
    });
    final query = Uri(
      queryParameters: {
        if (_search.text.trim().isNotEmpty) 'q': _search.text.trim(),
        ..._selected,
        'page': '$_page',
        'pageSize': '25',
      },
    ).query;
    try {
      final results = await Future.wait([
        widget.api.request('GET', '/members?$query'),
        if (_filters.isEmpty) widget.api.request('GET', '/members/filters'),
      ]);
      if (!mounted || generation != _generation) return;
      setState(() {
        _items = results[0]['items'] as List<dynamic>;
        _pages = results[0]['totalPages'] as int;
        _total = results[0]['total'] as int;
        if (results.length > 1) _filters = results[1];
      });
    } catch (error) {
      if (mounted && generation == _generation) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted && generation == _generation) setState(() => _busy = false);
    }
  }

  Future<void> _chooseFilters() async {
    final draft = Map<String, String>.from(_selected);
    final applied = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, update) {
          Widget dropdown(
            String field,
            String label,
            List<DropdownMenuItem<String>> entries,
          ) => Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: DropdownButtonFormField<String>(
              initialValue: draft[field] ?? '',
              isExpanded: true,
              decoration: InputDecoration(labelText: label),
              items: [
                const DropdownMenuItem(value: '', child: Text('All')),
                ...entries,
              ],
              onChanged: (value) => update(() {
                if (value == null || value.isEmpty) {
                  draft.remove(field);
                } else {
                  draft[field] = value;
                }
              }),
            ),
          );
          return AlertDialog(
            title: const Text('Filter members'),
            content: SizedBox(
              width: 360,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    dropdown('section', 'Section', [
                      for (final value in _filters['sections'] ?? [])
                        DropdownMenuItem(
                          value: value as String,
                          child: Text(value),
                        ),
                    ]),
                    dropdown('cadreId', 'Cadre', [
                      for (final value in _filters['cadres'] ?? [])
                        DropdownMenuItem(
                          value: value['id'] as String,
                          child: Text(
                            value['name'] as String,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ]),
                    dropdown('bcsBatch', 'BCS batch', [
                      for (final value in _filters['bcsBatches'] ?? [])
                        DropdownMenuItem(
                          value: value == null ? 'unknown' : '$value',
                          child: Text(value == null ? 'Unknown' : '$value'),
                        ),
                    ]),
                    dropdown('homeDistrict', 'Home district', [
                      for (final value in _filters['homeDistricts'] ?? [])
                        DropdownMenuItem(
                          value: value as String,
                          child: Text(value, overflow: TextOverflow.ellipsis),
                        ),
                    ]),
                    dropdown('bloodGroup', 'Blood group (as recorded)', [
                      for (final value in _filters['bloodGroups'] ?? [])
                        DropdownMenuItem(
                          value: value as String,
                          child: Text(value, overflow: TextOverflow.ellipsis),
                        ),
                    ]),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              TextButton(
                onPressed: () {
                  draft.clear();
                  Navigator.pop(dialogContext, true);
                },
                child: const Text('Clear'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Apply'),
              ),
            ],
          );
        },
      ),
    );
    if (applied == true && mounted) {
      _selected
        ..clear()
        ..addAll(draft);
      _page = 1;
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 700),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _search,
                    decoration: const InputDecoration(
                      hintText: 'Search by name',
                      prefixIcon: Icon(Icons.search),
                    ),
                    onChanged: (_) {
                      _debounce?.cancel();
                      _debounce = Timer(const Duration(milliseconds: 350), () {
                        _page = 1;
                        _load();
                      });
                    },
                  ),
                ),
                IconButton(
                  onPressed: _filters.isEmpty ? null : _chooseFilters,
                  tooltip: 'Filter members',
                  icon: Icon(
                    _selected.isEmpty
                        ? Icons.filter_list
                        : Icons.filter_list_alt,
                  ),
                ),
              ],
            ),
          ),
          if (_busy) const LinearProgressIndicator(),
          Expanded(
            child: _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(_error!, textAlign: TextAlign.center),
                          TextButton(
                            onPressed: _load,
                            child: const Text('Retry'),
                          ),
                        ],
                      ),
                    ),
                  )
                : _busy
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      children: [
                        Text(
                          '$_total members',
                          style: Theme.of(context).textTheme.labelLarge,
                        ),
                        if (_items.isEmpty)
                          const Padding(
                            padding: EdgeInsets.all(40),
                            child: Text('No members match your search.'),
                          ),
                        for (final raw in _items)
                          Card(
                            child: ListTile(
                              leading: const CircleAvatar(
                                child: Icon(Icons.person_outline),
                              ),
                              title: Text(raw['name'] as String),
                              subtitle: Text(
                                '${raw['cadre']['name'] as String} · Section ${raw['section']}\nFTC ${raw['ftcId']}',
                              ),
                              isThreeLine: true,
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) => LiveMemberDetail(
                                    api: widget.api,
                                    id: raw['id'] as String,
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
          ),
          if (_pages > 0)
            SafeArea(
              top: false,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    onPressed: _busy || _page <= 1
                        ? null
                        : () {
                            _page--;
                            _load();
                          },
                    tooltip: 'Previous page',
                    icon: const Icon(Icons.chevron_left),
                  ),
                  Text('Page $_page of $_pages'),
                  IconButton(
                    onPressed: _busy || _page >= _pages
                        ? null
                        : () {
                            _page++;
                            _load();
                          },
                    tooltip: 'Next page',
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
            ),
        ],
      ),
    ),
  );
}
